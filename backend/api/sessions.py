"""Session create/join/leave, logs, recap, and AP award endpoints."""

import secrets
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from database import get_db
from models.user import User
from models.campaign import Campaign, CampaignPlayer
from models.session_state import GameSession, SessionLog, APAward
from models.character import Character

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_session_code(length: int = 6) -> str:
    return secrets.token_urlsafe(length)[:length].upper()


async def _get_session(session_id: str, db: AsyncSession) -> GameSession:
    result = await db.execute(select(GameSession).where(GameSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


async def _verify_gm(session: GameSession, user: User, db: AsyncSession) -> Campaign:
    result = await db.execute(
        select(Campaign).where(Campaign.id == session.campaign_id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign or campaign.gm_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only GM can perform this action")
    return campaign


async def _verify_member(session: GameSession, user: User, db: AsyncSession) -> Campaign:
    result = await db.execute(select(Campaign).where(Campaign.id == session.campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    if campaign.gm_user_id != user.id:
        player_check = await db.execute(
            select(CampaignPlayer).where(
                CampaignPlayer.campaign_id == campaign.id,
                CampaignPlayer.user_id == user.id,
            )
        )
        if not player_check.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")
    return campaign


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class SessionCreate(BaseModel):
    campaign_id: str


class SessionResponse(BaseModel):
    id: str
    campaign_id: str
    session_number: int
    session_code: str
    status: str
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    gm_notes: Optional[str] = None
    recap_text: Optional[str] = None

    model_config = {"from_attributes": True}


class JoinSessionRequest(BaseModel):
    session_code: str


class SessionLogResponse(BaseModel):
    id: str
    session_id: str
    entry_type: str
    data: Optional[dict] = None
    timestamp: datetime

    model_config = {"from_attributes": True}


class RecapRequest(BaseModel):
    recap_text: str


class APAwardRequest(BaseModel):
    awards: list[dict]
    """Each: {"character_id": UUID, "amount": int, "reason": str}"""


class APAwardResponse(BaseModel):
    id: str
    session_id: str
    character_id: str
    amount: int
    reason: Optional[str] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: SessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new session for a campaign (GM only)."""
    campaign_result = await db.execute(
        select(Campaign).where(
            Campaign.id == body.campaign_id,
            Campaign.gm_user_id == current_user.id,
        )
    )
    campaign = campaign_result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found or not GM")

    # Determine session number
    existing = await db.execute(
        select(GameSession)
        .where(GameSession.campaign_id == body.campaign_id)
        .order_by(GameSession.session_number.desc())
    )
    last_session = existing.scalars().first()
    next_number = (last_session.session_number + 1) if last_session else 1

    session = GameSession(
        campaign_id=body.campaign_id,
        session_number=next_number,
        session_code=_generate_session_code(),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get session info."""
    session = await _get_session(session_id, db)
    await _verify_member(session, current_user, db)
    return session


@router.post("/join", response_model=SessionResponse)
async def join_session(
    body: JoinSessionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Join a session by session_code."""
    result = await db.execute(
        select(GameSession).where(GameSession.session_code == body.session_code)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid session code")

    if session.status == "ended":
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Session has ended")

    # Verify user is member of the campaign
    await _verify_member(session, current_user, db)
    return session


@router.put("/{session_id}/pause", response_model=SessionResponse)
async def pause_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Pause a session (GM only)."""
    session = await _get_session(session_id, db)
    await _verify_gm(session, current_user, db)

    if session.status not in ("active", "lobby"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot pause session in {session.status} state",
        )

    session.status = "paused"
    await db.commit()
    await db.refresh(session)
    return session


@router.put("/{session_id}/resume", response_model=SessionResponse)
async def resume_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Resume a paused session (GM only)."""
    session = await _get_session(session_id, db)
    await _verify_gm(session, current_user, db)

    if session.status != "paused":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Session is not paused",
        )

    session.status = "active"
    if not session.started_at:
        session.started_at = datetime.utcnow()
    await db.commit()
    await db.refresh(session)
    return session


@router.put("/{session_id}/end", response_model=SessionResponse)
async def end_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """End a session (GM only). Triggers AP award dialog and session log."""
    session = await _get_session(session_id, db)
    campaign = await _verify_gm(session, current_user, db)

    if session.status == "ended":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Session already ended",
        )

    session.status = "ended"
    session.ended_at = datetime.utcnow()

    # Update campaign last_played
    campaign.last_played = datetime.utcnow()

    await db.commit()
    await db.refresh(session)
    return session


@router.get("/{session_id}/log", response_model=list[SessionLogResponse])
async def get_session_log(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get session log entries."""
    session = await _get_session(session_id, db)
    await _verify_member(session, current_user, db)

    result = await db.execute(
        select(SessionLog)
        .where(SessionLog.session_id == session_id)
        .order_by(SessionLog.timestamp)
    )
    return result.scalars().all()


@router.post("/{session_id}/recap", response_model=SessionResponse)
async def save_recap(
    session_id: str,
    body: RecapRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save or update session recap text (GM only)."""
    session = await _get_session(session_id, db)
    await _verify_gm(session, current_user, db)

    session.recap_text = body.recap_text
    await db.commit()
    await db.refresh(session)
    return session


@router.post("/{session_id}/ap-award", response_model=list[APAwardResponse])
async def award_ap(
    session_id: str,
    body: APAwardRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Award AP to characters at end of session (GM only)."""
    session = await _get_session(session_id, db)
    await _verify_gm(session, current_user, db)

    created_awards: list[APAward] = []

    for award_data in body.awards:
        char_id = uuid.UUID(str(award_data["character_id"]))
        amount = int(award_data["amount"])
        reason = award_data.get("reason", "")

        # Verify character exists
        char_result = await db.execute(select(Character).where(Character.id == char_id))
        char = char_result.scalar_one_or_none()
        if not char:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Character {char_id} not found",
            )

        award = APAward(
            session_id=session_id,
            character_id=char_id,
            amount=amount,
            reason=reason,
        )
        db.add(award)

        # Update character AP
        char.total_ap += amount
        char.available_ap += amount
        created_awards.append(award)

    await db.commit()
    for a in created_awards:
        await db.refresh(a)
    return created_awards


@router.get("/by-code/{session_code}")
async def get_session_by_code(
    session_code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get session info by session code."""
    result = await db.execute(
        select(GameSession).where(GameSession.session_code == session_code)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return {
        "id": session.id,
        "campaign_id": session.campaign_id,
        "session_number": session.session_number,
        "session_code": session.session_code,
        "status": session.status,
    }

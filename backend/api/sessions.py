"""Session CRUD, player management, completion, and statistics endpoints."""

import secrets
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.auth import get_current_user
from database import get_db
from models.user import User
from models.character import Character
from models.session_state import (
    GameSession,
    SessionPlayer,
    SessionStatistics,
    SessionLog,
    APAward,
    CombatState,
    SessionFeedback,
)
from ws.manager import manager

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


async def _verify_gm(session: GameSession, user: User) -> None:
    if session.gm_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only GM can perform this action",
        )


async def _verify_gm_or_active_player(
    session: GameSession, user: User, db: AsyncSession
) -> None:
    """Verify user is either the GM or an active player in this session."""
    if session.gm_user_id == user.id:
        return
    result = await db.execute(
        select(SessionPlayer).where(
            SessionPlayer.session_id == session.id,
            SessionPlayer.user_id == user.id,
            SessionPlayer.status == "active",
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this session",
        )


async def _generate_unique_code(db: AsyncSession) -> str:
    """Generate a unique session code, retrying on collision."""
    for _ in range(10):
        code = _generate_session_code()
        result = await db.execute(
            select(GameSession).where(GameSession.session_code == code)
        )
        if not result.scalar_one_or_none():
            return code
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Failed to generate unique session code",
    )


def _snapshot_character(char: Character) -> dict:
    """Create a snapshot dict of a character's session-relevant state."""
    import copy
    return {
        "current_vitals": copy.deepcopy(char.current_vitals) if char.current_vitals else None,
        "conditions": copy.deepcopy(char.conditions) if char.conditions else None,
        "basis_inventory": copy.deepcopy(char.basis_inventory) if char.basis_inventory else None,
    }


def _restore_character_from_snapshot(char: Character, snapshot: dict) -> None:
    """Restore a character's session-relevant state from a snapshot."""
    if snapshot:
        char.current_vitals = snapshot.get("current_vitals")
        char.conditions = snapshot.get("conditions")
        char.basis_inventory = snapshot.get("basis_inventory")


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class SessionCreate(BaseModel):
    name: str


class SessionPlayerResponse(BaseModel):
    id: str
    user_id: str
    username: str
    character_id: Optional[str] = None
    character_name: Optional[str] = None
    joined_at: datetime
    status: str
    online: bool = False

    model_config = {"from_attributes": True}


def _character_to_dict(char: Character) -> dict:
    """Serialize a Character ORM object to a dict for the frontend."""
    if not char:
        return None
    return {
        "id": char.id,
        "name": char.name,
        "species": char.species,
        "culture": char.culture,
        "profession": char.profession,
        "experience_grade": char.experience_grade,
        "total_ap": char.total_ap,
        "available_ap": char.available_ap,
        "attributes": char.attributes,
        "derived_values": char.derived_values,
        "combat_values": char.combat_values,
        "combat_techniques": char.combat_techniques,
        "talents": char.talents,
        "spells": char.spells,
        "liturgies": char.liturgies,
        "special_abilities": char.special_abilities,
        "advantages": char.advantages,
        "disadvantages": char.disadvantages,
        "basis_inventory": char.basis_inventory,
        "current_vitals": char.current_vitals,
        "conditions": char.conditions,
        "portrait_url": char.portrait_url,
    }


class SessionResponse(BaseModel):
    id: str
    name: str
    gm_user_id: str
    campaign_id: Optional[str] = None
    session_code: str
    status: str
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    gm_notes: Optional[str] = None
    recap_text: Optional[str] = None
    player_count: Optional[int] = None

    model_config = {"from_attributes": True}


class ManagedSessionResponse(BaseModel):
    id: str
    name: str
    gm_user_id: str
    session_code: str
    status: str
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    player_count: int = 0

    model_config = {"from_attributes": True}


class JoinedSessionResponse(BaseModel):
    id: str
    name: str
    gm_user_id: str
    gm_username: str
    session_code: str
    status: str
    created_at: Optional[datetime] = None
    character_id: Optional[str] = None
    character_name: Optional[str] = None

    model_config = {"from_attributes": True}


class JoinSessionRequest(BaseModel):
    code: str
    character_id: str


class SessionStatisticsResponse(BaseModel):
    id: str
    session_id: str
    character_id: str
    user_id: str
    kills: int = 0
    damage_dealt: int = 0
    damage_taken: int = 0
    dice_rolls: int = 0
    critical_successes: int = 0
    critical_failures: int = 0
    spells_cast: int = 0
    liturgies_cast: int = 0
    conditions_suffered: int = 0
    schip_spent: int = 0
    probes_attempted: int = 0
    probes_succeeded: int = 0
    healing_done: int = 0
    items_used: int = 0
    extra: Optional[dict] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Session CRUD (GM)
# ---------------------------------------------------------------------------

@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: SessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new session. The current user becomes GM."""
    session_code = await _generate_unique_code(db)

    session = GameSession(
        name=body.name,
        gm_user_id=current_user.id,
        session_code=session_code,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return SessionResponse(
        id=session.id,
        name=session.name,
        gm_user_id=session.gm_user_id,
        campaign_id=session.campaign_id,
        session_code=session.session_code,
        status=session.status,
        started_at=session.started_at,
        ended_at=session.ended_at,
        created_at=session.created_at,
        completed_at=session.completed_at,
        gm_notes=session.gm_notes,
        recap_text=session.recap_text,
        player_count=0,
    )


@router.get("/managed", response_model=list[ManagedSessionResponse])
async def list_managed_sessions(
    hide_completed: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List sessions where the current user is GM."""
    query = select(GameSession).where(GameSession.gm_user_id == current_user.id)
    if hide_completed:
        query = query.where(GameSession.status != "complete")
    query = query.order_by(GameSession.created_at.desc())

    result = await db.execute(query)
    sessions = result.scalars().all()

    response = []
    for s in sessions:
        # Count active players
        count_result = await db.execute(
            select(sa_func.count(SessionPlayer.id)).where(
                SessionPlayer.session_id == s.id,
                SessionPlayer.status == "active",
            )
        )
        player_count = count_result.scalar() or 0

        response.append(ManagedSessionResponse(
            id=s.id,
            name=s.name,
            gm_user_id=s.gm_user_id,
            session_code=s.session_code,
            status=s.status,
            created_at=s.created_at,
            completed_at=s.completed_at,
            player_count=player_count,
        ))

    return response


@router.get("/joined", response_model=list[JoinedSessionResponse])
async def list_joined_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List sessions where the current user is an active player."""
    result = await db.execute(
        select(SessionPlayer)
        .where(
            SessionPlayer.user_id == current_user.id,
            SessionPlayer.status == "active",
        )
        .options(selectinload(SessionPlayer.session), selectinload(SessionPlayer.character))
    )
    session_players = result.scalars().all()

    response = []
    for sp in session_players:
        session = sp.session
        if not session:
            continue

        # Get GM username
        gm_result = await db.execute(
            select(User).where(User.id == session.gm_user_id)
        )
        gm_user = gm_result.scalar_one_or_none()
        gm_username = gm_user.username if gm_user else "Unknown"

        response.append(JoinedSessionResponse(
            id=session.id,
            name=session.name,
            gm_user_id=session.gm_user_id,
            gm_username=gm_username,
            session_code=session.session_code,
            status=session.status,
            created_at=session.created_at,
            character_id=sp.character_id,
            character_name=sp.character.name if sp.character else None,
        ))

    return response


@router.get("/by-code/{session_code}", response_model=SessionResponse)
async def get_session_by_code(
    session_code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Look up a session by its code. Must be GM or active player."""
    result = await db.execute(
        select(GameSession).where(GameSession.session_code == session_code)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await _verify_gm_or_active_player(session, current_user, db)

    count_result = await db.execute(
        select(sa_func.count(SessionPlayer.id)).where(
            SessionPlayer.session_id == session.id,
            SessionPlayer.status == "active",
        )
    )
    player_count = count_result.scalar() or 0

    return SessionResponse(
        id=session.id,
        name=session.name,
        gm_user_id=session.gm_user_id,
        campaign_id=session.campaign_id,
        session_code=session.session_code,
        status=session.status,
        started_at=session.started_at,
        ended_at=session.ended_at,
        created_at=session.created_at,
        completed_at=session.completed_at,
        gm_notes=session.gm_notes,
        recap_text=session.recap_text,
        player_count=player_count,
    )


@router.get("/{session_id}/players-detail")
async def list_players_detail(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List players with full character data for the GM cockpit and player dashboard."""
    session = await _get_session(session_id, db)
    await _verify_gm_or_active_player(session, current_user, db)

    result = await db.execute(
        select(SessionPlayer)
        .where(SessionPlayer.session_id == session.id, SessionPlayer.status == "active")
        .options(selectinload(SessionPlayer.user), selectinload(SessionPlayer.character))
    )
    session_players = result.scalars().all()

    connected_users = manager.get_connected_users(session.session_code)

    response = []
    for sp in session_players:
        char_dict = _character_to_dict(sp.character)
        cv = sp.character.current_vitals if sp.character and sp.character.current_vitals else {}
        response.append({
            "user_id": sp.user_id,
            "username": sp.user.username if sp.user else "Unknown",
            "character_id": sp.character_id,
            "character": char_dict,
            "current_vitals": cv,
            "connected": sp.user_id in connected_users,
        })

    return response


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get session details. Must be GM or active player."""
    session = await _get_session(session_id, db)
    await _verify_gm_or_active_player(session, current_user, db)

    # Count active players
    count_result = await db.execute(
        select(sa_func.count(SessionPlayer.id)).where(
            SessionPlayer.session_id == session.id,
            SessionPlayer.status == "active",
        )
    )
    player_count = count_result.scalar() or 0

    return SessionResponse(
        id=session.id,
        name=session.name,
        gm_user_id=session.gm_user_id,
        campaign_id=session.campaign_id,
        session_code=session.session_code,
        status=session.status,
        started_at=session.started_at,
        ended_at=session.ended_at,
        created_at=session.created_at,
        completed_at=session.completed_at,
        gm_notes=session.gm_notes,
        recap_text=session.recap_text,
        player_count=player_count,
    )


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a session. GM only. Not allowed if status is 'complete'."""
    session = await _get_session(session_id, db)
    await _verify_gm(session, current_user)

    if session.status == "complete":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot delete a completed session",
        )

    # Restore characters from snapshots and unlock them
    sp_result = await db.execute(
        select(SessionPlayer).where(
            SessionPlayer.session_id == session.id,
            SessionPlayer.status == "active",
        )
    )
    for sp in sp_result.scalars().all():
        if sp.character_id:
            char_result = await db.execute(
                select(Character).where(Character.id == sp.character_id)
            )
            char = char_result.scalar_one_or_none()
            if char:
                if sp.character_snapshot:
                    _restore_character_from_snapshot(char, sp.character_snapshot)
                char.locked_session_id = None

    # Also unlock any characters that might be locked without a SessionPlayer record
    remaining = await db.execute(
        select(Character).where(Character.locked_session_id == session.id)
    )
    for char in remaining.scalars().all():
        char.locked_session_id = None

    # Hard delete — SessionPlayer and SessionStatistics cascade
    await db.delete(session)
    await db.commit()


@router.put("/{session_id}/complete", response_model=SessionResponse)
async def complete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark session as complete. GM only. Must be status='active'.

    For each active SessionPlayer:
    - Apply character changes from session state to base Character
    - Clear locked_session_id
    Save completion_snapshot with all player states.
    """
    session = await _get_session(session_id, db)
    await _verify_gm(session, current_user)

    if session.status not in ("active", "paused"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot complete session in '{session.status}' state, must be 'active' or 'paused'",
        )

    # Get all active session players
    sp_result = await db.execute(
        select(SessionPlayer).where(
            SessionPlayer.session_id == session.id,
            SessionPlayer.status == "active",
        )
    )
    active_players = sp_result.scalars().all()

    completion_snapshot = {"players": []}

    from models.inventory import InventoryItem
    from models.campaign import CampaignPlayer

    for sp in active_players:
        # Get the character
        if sp.character_id:
            char_result = await db.execute(
                select(Character).where(Character.id == sp.character_id)
            )
            char = char_result.scalar_one_or_none()
            if char:
                # --- Inventory carry-over ---
                # Session-scoped InventoryItem records become permanent
                # (clear session_id so they survive as base character items)
                inv_result = await db.execute(
                    select(InventoryItem).where(
                        InventoryItem.character_id == sp.character_id,
                        InventoryItem.session_id == session.id,
                    )
                )
                for item in inv_result.scalars().all():
                    item.session_id = None

                # current_vitals, conditions, basis_inventory, active_buffs
                # are already the "live" state from the session — they persist
                # as the base state going forward (session changes are permanent).

                completion_snapshot["players"].append({
                    "user_id": sp.user_id,
                    "character_id": sp.character_id,
                    "character_name": char.name,
                    "final_vitals": dict(char.current_vitals) if char.current_vitals else None,
                    "final_conditions": list(char.conditions) if char.conditions else None,
                    "final_inventory_count": len(
                        (char.basis_inventory or {}).get("items", [])
                        if isinstance(char.basis_inventory, dict)
                        else (char.basis_inventory or [])
                    ),
                })

                # Update CampaignPlayer snapshot with post-session state
                if session.campaign_id:
                    cp_result = await db.execute(
                        select(CampaignPlayer).where(
                            CampaignPlayer.campaign_id == session.campaign_id,
                            CampaignPlayer.character_id == sp.character_id,
                        )
                    )
                    cp = cp_result.scalar_one_or_none()
                    if cp:
                        vitals = char.current_vitals or {}
                        cp.campaign_snapshot = {
                            "current_lep": vitals.get("lep", 0),
                            "current_asp": vitals.get("asp", 0),
                            "current_kap": vitals.get("kap", 0),
                            "current_schip": vitals.get("schip", 0),
                            "conditions": char.conditions or [],
                            "campaign_inventory": char.basis_inventory,
                        }

                # Unlock the character
                char.locked_session_id = None

    session.status = "complete"
    session.completed_at = datetime.utcnow()
    session.completion_snapshot = completion_snapshot

    await db.commit()
    await db.refresh(session)

    # Count active players for response
    count_result = await db.execute(
        select(sa_func.count(SessionPlayer.id)).where(
            SessionPlayer.session_id == session.id,
            SessionPlayer.status == "active",
        )
    )
    player_count = count_result.scalar() or 0

    return SessionResponse(
        id=session.id,
        name=session.name,
        gm_user_id=session.gm_user_id,
        campaign_id=session.campaign_id,
        session_code=session.session_code,
        status=session.status,
        started_at=session.started_at,
        ended_at=session.ended_at,
        created_at=session.created_at,
        completed_at=session.completed_at,
        gm_notes=session.gm_notes,
        recap_text=session.recap_text,
        player_count=player_count,
    )


# ---------------------------------------------------------------------------
# Player Management
# ---------------------------------------------------------------------------

@router.post("/join", response_model=SessionResponse)
async def join_session(
    body: JoinSessionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Join a session by code with a character.

    Validates: session is active/lobby, character belongs to user,
    character is not locked to another session.
    Creates SessionPlayer, snapshots character state, locks character.
    """
    # Find session by code
    result = await db.execute(
        select(GameSession).where(GameSession.session_code == body.code)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid session code",
        )

    if session.status not in ("lobby", "active"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot join session in '{session.status}' state",
        )

    # Cannot join own session as player
    if session.gm_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="GM cannot join their own session as a player",
        )

    # Verify character belongs to user
    char_result = await db.execute(
        select(Character).where(
            Character.id == body.character_id,
            Character.user_id == current_user.id,
        )
    )
    char = char_result.scalar_one_or_none()
    if not char:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found or does not belong to you",
        )

    # Check character is not locked
    if char.locked_session_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Character is already locked to another session",
        )

    # Check if user already in this session
    existing = await db.execute(
        select(SessionPlayer).where(
            SessionPlayer.session_id == session.id,
            SessionPlayer.user_id == current_user.id,
        )
    )
    existing_sp = existing.scalar_one_or_none()
    if existing_sp:
        if existing_sp.status == "active":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Already in this session",
            )
        # Re-joining after leaving: preserve existing snapshot (vitals, conditions, buffs)
        existing_sp.status = "active"
        existing_sp.character_id = char.id
        if not existing_sp.character_snapshot:
            existing_sp.character_snapshot = _snapshot_character(char)
        char.locked_session_id = session.id
        await db.commit()
        await db.refresh(session)

        count_result = await db.execute(
            select(sa_func.count(SessionPlayer.id)).where(
                SessionPlayer.session_id == session.id,
                SessionPlayer.status == "active",
            )
        )
        player_count = count_result.scalar() or 0

        return SessionResponse(
            id=session.id,
            name=session.name,
            gm_user_id=session.gm_user_id,
            campaign_id=session.campaign_id,
            session_code=session.session_code,
            status=session.status,
            started_at=session.started_at,
            ended_at=session.ended_at,
            created_at=session.created_at,
            completed_at=session.completed_at,
            gm_notes=session.gm_notes,
            recap_text=session.recap_text,
            player_count=player_count,
        )

    # Snapshot and lock
    snapshot = _snapshot_character(char)
    char.locked_session_id = session.id

    sp = SessionPlayer(
        session_id=session.id,
        user_id=current_user.id,
        character_id=char.id,
        character_snapshot=snapshot,
    )
    db.add(sp)
    await db.commit()
    await db.refresh(session)

    count_result = await db.execute(
        select(sa_func.count(SessionPlayer.id)).where(
            SessionPlayer.session_id == session.id,
            SessionPlayer.status == "active",
        )
    )
    player_count = count_result.scalar() or 0

    return SessionResponse(
        id=session.id,
        name=session.name,
        gm_user_id=session.gm_user_id,
        campaign_id=session.campaign_id,
        session_code=session.session_code,
        status=session.status,
        started_at=session.started_at,
        ended_at=session.ended_at,
        created_at=session.created_at,
        completed_at=session.completed_at,
        gm_notes=session.gm_notes,
        recap_text=session.recap_text,
        player_count=player_count,
    )


@router.post("/{session_id}/leave", status_code=status.HTTP_200_OK)
async def leave_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Player leaves session voluntarily.

    Restores character from snapshot (rollback all session changes).
    Clears locked_session_id. Sets SessionPlayer.status='left'.
    WARNING: this discards all progress made during the session.
    """
    session = await _get_session(session_id, db)

    # Find player record
    result = await db.execute(
        select(SessionPlayer).where(
            SessionPlayer.session_id == session.id,
            SessionPlayer.user_id == current_user.id,
            SessionPlayer.status == "active",
        )
    )
    sp = result.scalar_one_or_none()
    if not sp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not an active player in this session",
        )

    # Restore character from snapshot
    if sp.character_id:
        char_result = await db.execute(
            select(Character).where(Character.id == sp.character_id)
        )
        char = char_result.scalar_one_or_none()
        if char:
            if sp.character_snapshot:
                _restore_character_from_snapshot(char, sp.character_snapshot)
            char.locked_session_id = None

    sp.status = "left"
    await db.commit()

    return {"detail": "Left session. Character restored to pre-session state."}


@router.delete("/{session_id}/players/{user_id}", status_code=status.HTTP_200_OK)
async def remove_player(
    session_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """GM removes a player from the session.

    Same as leave but sets status='removed'.
    Restores character from snapshot and clears lock.
    """
    session = await _get_session(session_id, db)
    await _verify_gm(session, current_user)

    # Find player record
    result = await db.execute(
        select(SessionPlayer).where(
            SessionPlayer.session_id == session.id,
            SessionPlayer.user_id == user_id,
            SessionPlayer.status == "active",
        )
    )
    sp = result.scalar_one_or_none()
    if not sp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Player not found in this session",
        )

    # Restore character from snapshot
    if sp.character_id:
        char_result = await db.execute(
            select(Character).where(Character.id == sp.character_id)
        )
        char = char_result.scalar_one_or_none()
        if char:
            if sp.character_snapshot:
                _restore_character_from_snapshot(char, sp.character_snapshot)
            char.locked_session_id = None

    sp.status = "removed"
    await db.commit()

    return {"detail": "Player removed. Character restored to pre-session state."}


@router.get("/{session_id}/players", response_model=list[SessionPlayerResponse])
async def list_players(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List players in a session with character info and online status."""
    session = await _get_session(session_id, db)
    await _verify_gm_or_active_player(session, current_user, db)

    result = await db.execute(
        select(SessionPlayer)
        .where(SessionPlayer.session_id == session.id)
        .options(selectinload(SessionPlayer.user), selectinload(SessionPlayer.character))
    )
    session_players = result.scalars().all()

    # Get connected users from WS manager
    connected_users = manager.get_connected_users(session.session_code)

    response = []
    for sp in session_players:
        response.append(SessionPlayerResponse(
            id=sp.id,
            user_id=sp.user_id,
            username=sp.user.username if sp.user else "Unknown",
            character_id=sp.character_id,
            character_name=sp.character.name if sp.character else None,
            joined_at=sp.joined_at,
            status=sp.status,
            online=sp.user_id in connected_users,
        ))

    return response


# ---------------------------------------------------------------------------
# Completion & Stats
# ---------------------------------------------------------------------------

@router.get("/{session_id}/statistics")
async def get_session_statistics(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get session info and per-character statistics for a session."""
    session = await _get_session(session_id, db)
    await _verify_gm_or_active_player(session, current_user, db)

    result = await db.execute(
        select(SessionStatistics)
        .where(SessionStatistics.session_id == session.id)
        .options(selectinload(SessionStatistics.character))
    )
    stats_rows = result.scalars().all()

    stats = []
    for s in stats_rows:
        stats.append({
            "id": s.id,
            "session_id": s.session_id,
            "character_id": s.character_id,
            "user_id": s.user_id,
            "character_name": s.character.name if s.character else "Unbekannt",
            "kills": s.kills,
            "damage_dealt": s.damage_dealt,
            "damage_taken": s.damage_taken,
            "dice_rolls": s.dice_rolls,
            "critical_successes": s.critical_successes,
            "critical_failures": s.critical_failures,
            "spells_cast": s.spells_cast,
            "liturgies_cast": s.liturgies_cast,
            "conditions_suffered": s.conditions_suffered,
            "schip_spent": s.schip_spent,
            "probes_attempted": s.probes_attempted,
            "probes_succeeded": s.probes_succeeded,
            "healing_done": s.healing_done,
            "items_used": s.items_used,
            "extra": s.extra,
        })

    return {
        "session": {
            "id": session.id,
            "name": session.name,
            "status": session.status,
            "created_at": session.created_at,
            "completed_at": session.completed_at,
        },
        "stats": stats,
    }


# ---------------------------------------------------------------------------
# Session Export (log / backup)
# ---------------------------------------------------------------------------

@router.get("/{session_id}/export")
async def export_session(
    session_id: str,
    format: str = "json",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export session as JSON or Markdown. GM or active player."""
    session = await _get_session(session_id, db)
    await _verify_gm_or_active_player(session, current_user, db)

    # --- Logs (Protokoll entries) ---
    log_result = await db.execute(
        select(SessionLog)
        .where(SessionLog.session_id == session_id)
        .order_by(SessionLog.timestamp)
    )
    logs = [
        {
            "entry_type": log.entry_type,
            "data": log.data,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None,
        }
        for log in log_result.scalars().all()
    ]

    # --- AP Awards ---
    ap_result = await db.execute(
        select(APAward).where(APAward.session_id == session_id)
    )
    ap_awards = [
        {
            "character_id": aw.character_id,
            "character_name": aw.character.name if aw.character else "Unbekannt",
            "amount": aw.amount,
            "reason": aw.reason,
        }
        for aw in ap_result.scalars().all()
    ]

    # --- Combat states ---
    combat_result = await db.execute(
        select(CombatState).where(CombatState.session_id == session_id)
    )
    combats = [
        {
            "status": cs.status,
            "round_number": cs.round_number,
            "initiative_order": cs.initiative_order,
            "combatants": cs.combatants,
        }
        for cs in combat_result.scalars().all()
    ]

    # --- Players ---
    player_result = await db.execute(
        select(SessionPlayer)
        .where(SessionPlayer.session_id == session_id)
        .options(selectinload(SessionPlayer.user), selectinload(SessionPlayer.character))
    )
    players = [
        {
            "user_id": sp.user_id,
            "username": sp.user.username if sp.user else "Unbekannt",
            "character_id": sp.character_id,
            "character_name": sp.character.name if sp.character else None,
            "status": sp.status,
            "joined_at": sp.joined_at.isoformat() if sp.joined_at else None,
        }
        for sp in player_result.scalars().all()
    ]

    # --- Statistics ---
    stats_result = await db.execute(
        select(SessionStatistics)
        .where(SessionStatistics.session_id == session_id)
        .options(selectinload(SessionStatistics.character))
    )
    stats = [
        {
            "character_id": s.character_id,
            "character_name": s.character.name if s.character else "Unbekannt",
            "kills": s.kills,
            "damage_dealt": s.damage_dealt,
            "damage_taken": s.damage_taken,
            "dice_rolls": s.dice_rolls,
            "critical_successes": s.critical_successes,
            "critical_failures": s.critical_failures,
            "spells_cast": s.spells_cast,
            "probes_attempted": s.probes_attempted,
            "probes_succeeded": s.probes_succeeded,
            "schip_spent": s.schip_spent,
        }
        for s in stats_result.scalars().all()
    ]

    data = {
        "format": "aventuria_vtt_session",
        "version": 1,
        "exported_at": datetime.utcnow().isoformat(),
        "session": {
            "id": session.id,
            "name": session.name,
            "status": session.status,
            "started_at": session.started_at.isoformat() if session.started_at else None,
            "ended_at": session.ended_at.isoformat() if session.ended_at else None,
            "completed_at": session.completed_at.isoformat() if session.completed_at else None,
            "gm_notes": session.gm_notes,
            "recap_text": session.recap_text,
        },
        "players": players,
        "logs": logs,
        "ap_awards": ap_awards,
        "combats": combats,
        "statistics": stats,
    }

    if format == "markdown":
        from fastapi.responses import PlainTextResponse
        md = _session_to_markdown(data)
        return PlainTextResponse(content=md, media_type="text/markdown")

    return data


def _session_to_markdown(data: dict) -> str:
    """Convert session export dict to readable Markdown."""
    s = data["session"]
    lines = [
        f"# {s['name']}",
        "",
        f"**Status:** {s['status']}",
    ]
    if s.get("started_at"):
        lines.append(f"**Beginn:** {s['started_at']}")
    if s.get("ended_at"):
        lines.append(f"**Ende:** {s['ended_at']}")
    lines.append("")

    # Players
    if data["players"]:
        lines.append("## Teilnehmer")
        lines.append("")
        for p in data["players"]:
            char_part = f" — {p['character_name']}" if p.get("character_name") else ""
            lines.append(f"- {p['username']}{char_part}")
        lines.append("")

    # Recap
    if s.get("recap_text"):
        lines.append("## Zusammenfassung")
        lines.append("")
        lines.append(s["recap_text"])
        lines.append("")

    # Protokoll
    if data["logs"]:
        lines.append("## Protokoll")
        lines.append("")
        for entry in data["logs"]:
            ts = entry["timestamp"][:16] if entry.get("timestamp") else ""
            entry_data = entry.get("data") or {}
            text = entry_data.get("text") or entry_data.get("message") or str(entry_data)
            lines.append(f"- `{ts}` [{entry['entry_type']}] {text}")
        lines.append("")

    # AP Awards
    if data["ap_awards"]:
        lines.append("## AP-Vergabe")
        lines.append("")
        for aw in data["ap_awards"]:
            reason = f" ({aw['reason']})" if aw.get("reason") else ""
            lines.append(f"- {aw['character_name']}: {aw['amount']} AP{reason}")
        lines.append("")

    # Statistics
    if data["statistics"]:
        lines.append("## Statistiken")
        lines.append("")
        lines.append("| Held | Würfe | Krit+ | Krit- | Schaden | Erhalten | Kills |")
        lines.append("|------|-------|-------|-------|---------|----------|-------|")
        for st in data["statistics"]:
            lines.append(
                f"| {st['character_name']} | {st['dice_rolls']} | {st['critical_successes']} "
                f"| {st['critical_failures']} | {st['damage_dealt']} | {st['damage_taken']} "
                f"| {st['kills']} |"
            )
        lines.append("")

    # GM Notes
    if s.get("gm_notes"):
        lines.append("## GM-Notizen")
        lines.append("")
        lines.append(s["gm_notes"])
        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Session Feedback
# ---------------------------------------------------------------------------

class FeedbackRequest(BaseModel):
    rating: int = Field(ge=1, le=5)
    mvp_character_id: Optional[str] = None
    comment: Optional[str] = Field(default=None, max_length=500)


@router.post("/{session_id}/feedback")
async def submit_feedback(
    session_id: str,
    body: FeedbackRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit or update session feedback. One per user per session (upsert)."""
    session = await _get_session(session_id, db)
    await _verify_gm_or_active_player(session, current_user, db)

    # Find the user's character in this session
    sp_result = await db.execute(
        select(SessionPlayer).where(
            SessionPlayer.session_id == session_id,
            SessionPlayer.user_id == current_user.id,
        )
    )
    sp = sp_result.scalar_one_or_none()
    character_id = sp.character_id if sp else None

    # Upsert: check for existing feedback
    existing_result = await db.execute(
        select(SessionFeedback).where(
            SessionFeedback.session_id == session_id,
            SessionFeedback.user_id == current_user.id,
        )
    )
    existing = existing_result.scalar_one_or_none()
    is_update = existing is not None

    if existing:
        existing.rating = body.rating
        existing.mvp_character_id = body.mvp_character_id
        existing.comment = body.comment
        feedback = existing
    else:
        import uuid
        feedback = SessionFeedback(
            id=str(uuid.uuid4()),
            session_id=session_id,
            user_id=current_user.id,
            character_id=character_id,
            rating=body.rating,
            mvp_character_id=body.mvp_character_id,
            comment=body.comment,
        )
        db.add(feedback)

    await db.commit()

    return {
        "id": feedback.id,
        "session_id": session_id,
        "rating": feedback.rating,
        "mvp_character_id": feedback.mvp_character_id,
        "comment": feedback.comment,
        "updated": is_update,
    }


@router.get("/{session_id}/feedback")
async def get_session_feedback(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all feedback for a session. GM sees all; players see aggregate only."""
    session = await _get_session(session_id, db)
    is_gm = session.gm_user_id == current_user.id

    result = await db.execute(
        select(SessionFeedback).where(SessionFeedback.session_id == session_id)
    )
    feedbacks = result.scalars().all()

    if not feedbacks:
        return {"session_id": session_id, "count": 0, "average_rating": None, "mvp": None, "feedback": []}

    # Compute aggregate
    ratings = [f.rating for f in feedbacks]
    avg_rating = round(sum(ratings) / len(ratings), 1)

    # MVP vote tally
    mvp_votes: dict[str, int] = {}
    for f in feedbacks:
        if f.mvp_character_id:
            mvp_votes[f.mvp_character_id] = mvp_votes.get(f.mvp_character_id, 0) + 1
    mvp_id = max(mvp_votes, key=mvp_votes.get) if mvp_votes else None

    # Resolve MVP name
    mvp_name = None
    if mvp_id:
        from models.character import Character
        char_result = await db.execute(select(Character).where(Character.id == mvp_id))
        mvp_char = char_result.scalar_one_or_none()
        if mvp_char:
            mvp_name = mvp_char.name

    # Detail list (GM only, or own feedback for players)
    feedback_list = []
    for f in feedbacks:
        if is_gm or f.user_id == current_user.id:
            # Resolve character name
            char_name = None
            if f.character_id:
                from models.character import Character
                cr = await db.execute(select(Character).where(Character.id == f.character_id))
                c = cr.scalar_one_or_none()
                if c:
                    char_name = c.name
            feedback_list.append({
                "user_id": f.user_id,
                "character_id": f.character_id,
                "character_name": char_name,
                "rating": f.rating,
                "mvp_character_id": f.mvp_character_id,
                "comment": f.comment,
                "created_at": f.created_at.isoformat() if f.created_at else None,
            })

    return {
        "session_id": session_id,
        "count": len(feedbacks),
        "average_rating": avg_rating,
        "mvp": {"character_id": mvp_id, "name": mvp_name, "votes": mvp_votes.get(mvp_id, 0)} if mvp_id else None,
        "feedback": feedback_list,
    }

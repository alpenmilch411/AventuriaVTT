"""Talent/Spell/Attribute probe request and resolution endpoints."""

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from database import get_db
from models.user import User
from models.campaign import Campaign, CampaignPlayer
from models.session_state import GameSession, SessionLog
from models.character import Character

router = APIRouter(prefix="/api/probes", tags=["probes"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ProbeRequestCreate(BaseModel):
    session_id: str
    probe_type: str  # "attribute" | "talent" | "spell" | "liturgy" | "combat"
    probe_id: str  # e.g. "MU", "Klettern", "Fulminictus"
    target_character_ids: list[uuid.UUID]
    modifier: int = 0
    description: Optional[str] = None
    secret: bool = False  # GM-only result


class ProbeResolveRequest(BaseModel):
    session_id: str
    character_id: str
    probe_type: str
    probe_id: str
    rolls: list[int]  # 1 roll for 1W20, 3 rolls for 3W20 talent probe
    modifier: int = 0
    fw: Optional[int] = None  # Fertigkeitswert for talent/spell probes
    attribute_values: Optional[list[int]] = None  # The 3 attribute values for 3W20


class GroupProbeRequest(BaseModel):
    session_id: str
    probe_type: str
    probe_id: str
    modifier: int = 0
    description: Optional[str] = None


class OpposedProbeRequest(BaseModel):
    session_id: str
    probe_type: str
    probe_id_a: str
    probe_id_b: str  # can be same or different
    character_id_a: str
    character_id_b: str
    modifier_a: int = 0
    modifier_b: int = 0
    rolls_a: list[int]
    rolls_b: list[int]
    fw_a: Optional[int] = None
    fw_b: Optional[int] = None
    attribute_values_a: Optional[list[int]] = None
    attribute_values_b: Optional[list[int]] = None


class ProbeResultResponse(BaseModel):
    success: bool
    character_id: str
    probe_type: str
    probe_id: str
    rolls: list[int]
    result: dict[str, Any]


class GroupProbeResultResponse(BaseModel):
    probe_type: str
    probe_id: str
    overall_success: bool
    individual_results: list[dict[str, Any]]
    cumulative_qs: int


class OpposedProbeResultResponse(BaseModel):
    winner: str  # "a" | "b" | "tie"
    result_a: dict[str, Any]
    result_b: dict[str, Any]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _verify_session_gm(session_id: str, user: User, db: AsyncSession) -> GameSession:
    result = await db.execute(select(GameSession).where(GameSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    campaign_result = await db.execute(select(Campaign).where(Campaign.id == session.campaign_id))
    campaign = campaign_result.scalar_one_or_none()
    if not campaign or campaign.gm_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only GM can request probes")
    return session


async def _get_character(character_id: str, db: AsyncSession) -> Character:
    result = await db.execute(select(Character).where(Character.id == character_id))
    char = result.scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Character {character_id} not found")
    return char


def _resolve_probe(
    probe_type: str,
    rolls: list[int],
    modifier: int,
    fw: Optional[int],
    attribute_values: Optional[list[int]],
) -> dict[str, Any]:
    """Resolve a probe using the engine."""
    from engine import probes as probes_engine

    if probe_type == "attribute" or probe_type == "combat":
        # 1W20 probe
        target_value = (attribute_values[0] if attribute_values else 10) + modifier
        roll = rolls[0] if rolls else 10
        return probes_engine.resolve_1w20_probe(
            target_value=target_value,
            roll=roll,
            modifiers=[{"source": "gm_modifier", "value": modifier}] if modifier else None,
        )
    else:
        # 3W20 probe (talent, spell, liturgy)
        if not attribute_values or len(attribute_values) < 3:
            # Fallback: use default values
            attribute_values = attribute_values or [10, 10, 10]
            while len(attribute_values) < 3:
                attribute_values.append(10)

        if len(rolls) < 3:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="3W20 probe requires 3 rolls",
            )

        return probes_engine.resolve_3w20_probe(
            attribute_values=attribute_values,
            fw=fw or 0,
            rolls=rolls[:3],
            modifiers=[{"source": "gm_modifier", "value": modifier}] if modifier else None,
        )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/request", response_model=dict)
async def request_probe(
    body: ProbeRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """GM requests a probe from one or more players."""
    session = await _verify_session_gm(body.session_id, current_user, db)

    # Validate characters exist
    for char_id in body.target_character_ids:
        await _get_character(char_id, db)

    # Log the probe request
    log = SessionLog(
        session_id=body.session_id,
        entry_type="probe",
        data={
            "event": "probe_requested",
            "probe_type": body.probe_type,
            "probe_id": body.probe_id,
            "target_characters": [str(cid) for cid in body.target_character_ids],
            "modifier": body.modifier,
            "description": body.description,
            "secret": body.secret,
        },
    )
    db.add(log)
    await db.commit()

    return {
        "status": "probe_requested",
        "probe_type": body.probe_type,
        "probe_id": body.probe_id,
        "target_character_ids": body.target_character_ids,
        "modifier": body.modifier,
        "secret": body.secret,
    }


@router.post("/resolve", response_model=ProbeResultResponse)
async def resolve_probe(
    body: ProbeResolveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit dice results and resolve a probe."""
    char = await _get_character(body.character_id, db)

    # Auto-fill attribute values from character if not provided
    attribute_values = body.attribute_values
    if not attribute_values and char.attributes:
        attrs = char.attributes
        # For talent probes, the caller should provide the 3 attribute IDs
        # For now, use the probe_id to look up from character attributes
        if body.probe_type == "attribute":
            val = attrs.get(body.probe_id, 10)
            attribute_values = [val]

    result = _resolve_probe(
        probe_type=body.probe_type,
        rolls=body.rolls,
        modifier=body.modifier,
        fw=body.fw,
        attribute_values=attribute_values,
    )

    # Log the result
    log = SessionLog(
        session_id=body.session_id,
        entry_type="probe",
        data={
            "event": "probe_resolved",
            "character_id": str(body.character_id),
            "probe_type": body.probe_type,
            "probe_id": body.probe_id,
            "rolls": body.rolls,
            "result": result,
        },
    )
    db.add(log)
    await db.commit()

    return ProbeResultResponse(
        success=result.get("success", False),
        character_id=body.character_id,
        probe_type=body.probe_type,
        probe_id=body.probe_id,
        rolls=body.rolls,
        result=result,
    )


@router.post("/group", response_model=GroupProbeResultResponse)
async def group_probe(
    body: GroupProbeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Group probe — all players in the session's campaign roll.
    This endpoint registers the group probe request.
    Individual results come via /resolve. This returns a summary structure.
    """
    session = await _verify_session_gm(body.session_id, current_user, db)

    # Get campaign and players
    campaign_result = await db.execute(select(Campaign).where(Campaign.id == session.campaign_id))
    campaign = campaign_result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    players_result = await db.execute(
        select(CampaignPlayer).where(CampaignPlayer.campaign_id == campaign.id)
    )
    players = players_result.scalars().all()

    # Log the group probe request
    log = SessionLog(
        session_id=body.session_id,
        entry_type="probe",
        data={
            "event": "group_probe_requested",
            "probe_type": body.probe_type,
            "probe_id": body.probe_id,
            "modifier": body.modifier,
            "description": body.description,
            "character_ids": [str(p.character_id) for p in players],
        },
    )
    db.add(log)
    await db.commit()

    # Return a placeholder structure — individual results come via /resolve
    return GroupProbeResultResponse(
        probe_type=body.probe_type,
        probe_id=body.probe_id,
        overall_success=False,  # Updated after all rolls are in
        individual_results=[
            {"character_id": str(p.character_id), "status": "pending"} for p in players
        ],
        cumulative_qs=0,
    )


@router.post("/opposed", response_model=OpposedProbeResultResponse)
async def opposed_probe(
    body: OpposedProbeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Opposed probe between two participants."""
    await _get_character(body.character_id_a, db)
    await _get_character(body.character_id_b, db)

    result_a = _resolve_probe(
        probe_type=body.probe_type,
        rolls=body.rolls_a,
        modifier=body.modifier_a,
        fw=body.fw_a,
        attribute_values=body.attribute_values_a,
    )

    result_b = _resolve_probe(
        probe_type=body.probe_type,
        rolls=body.rolls_b,
        modifier=body.modifier_b,
        fw=body.fw_b,
        attribute_values=body.attribute_values_b,
    )

    # Determine winner
    qs_a = result_a.get("qs", result_a.get("quality_level", 0))
    qs_b = result_b.get("qs", result_b.get("quality_level", 0))
    success_a = result_a.get("success", False)
    success_b = result_b.get("success", False)

    if success_a and not success_b:
        winner = "a"
    elif success_b and not success_a:
        winner = "b"
    elif qs_a > qs_b:
        winner = "a"
    elif qs_b > qs_a:
        winner = "b"
    else:
        winner = "tie"

    # Log
    log = SessionLog(
        session_id=body.session_id,
        entry_type="probe",
        data={
            "event": "opposed_probe_resolved",
            "character_a": str(body.character_id_a),
            "character_b": str(body.character_id_b),
            "winner": winner,
            "result_a": result_a,
            "result_b": result_b,
        },
    )
    db.add(log)
    await db.commit()

    return OpposedProbeResultResponse(
        winner=winner,
        result_a={"character_id": str(body.character_id_a), **result_a},
        result_b={"character_id": str(body.character_id_b), **result_b},
    )

"""Combat actions, initiative, and turn management endpoints."""

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
from models.session_state import GameSession, CombatState, SessionLog

router = APIRouter(prefix="/api/combat", tags=["combat"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_active_session(session_id: str, db: AsyncSession) -> GameSession:
    result = await db.execute(select(GameSession).where(GameSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


async def _get_combat(session_id: str, db: AsyncSession) -> CombatState:
    result = await db.execute(
        select(CombatState).where(
            CombatState.session_id == session_id,
            CombatState.status == "active",
        )
    )
    combat = result.scalar_one_or_none()
    if not combat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active combat in this session")
    return combat


async def _verify_session_gm(session: GameSession, user: User, db: AsyncSession) -> Campaign:
    result = await db.execute(select(Campaign).where(Campaign.id == session.campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign or campaign.gm_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only GM can perform this action")
    return campaign


async def _log_combat_event(session_id: str, data: dict, db: AsyncSession) -> None:
    log = SessionLog(session_id=session_id, entry_type="combat", data=data)
    db.add(log)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class StartCombatRequest(BaseModel):
    session_id: str
    combatants: list[dict[str, Any]]
    """
    Each: {
        "id": str,  # unique combatant id
        "name": str,
        "type": "player" | "npc" | "creature",
        "entity_id": UUID (optional, character or NPC id),
        "ini_basis": int,
        "current_lep": int,
        "max_lep": int,
        "aw": int (optional),
        "rs": int (optional),
        "conditions": [] (optional),
    }
    """


class CombatStateResponse(BaseModel):
    id: str
    session_id: str
    status: str
    current_turn_index: int
    round_number: int
    initiative_order: Optional[list] = None
    combatants: Optional[dict] = None

    model_config = {"from_attributes": True}


class InitiativeRequest(BaseModel):
    session_id: str
    combatant_id: str
    roll: int
    ini_basis: int


class ActionRequest(BaseModel):
    session_id: str
    combatant_id: str
    action_type: str  # "attack" | "defend" | "move" | "spell" | "liturgy" | "free" | "use_item" | "dodge" | "parry"
    target_id: Optional[str] = None
    details: Optional[dict] = None
    """
    details can include:
      weapon_id, spell_id, distance, maneuver, etc.
    """


class DiceResultRequest(BaseModel):
    session_id: str
    combatant_id: str
    context: str  # "attack" | "defense" | "damage" | "spell" | "initiative"
    rolls: list[int]
    details: Optional[dict] = None


class ActionResultResponse(BaseModel):
    success: bool
    combatant_id: str
    action_type: str
    result: dict[str, Any]
    combat_state: CombatStateResponse


class AddCombatantRequest(BaseModel):
    session_id: str
    combatant: dict[str, Any]


class ReorderRequest(BaseModel):
    session_id: str
    initiative_order: list[str]  # ordered combatant IDs


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/start", response_model=CombatStateResponse, status_code=status.HTTP_201_CREATED)
async def start_combat(
    body: StartCombatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start combat in a session (GM only). Creates a CombatState."""
    session = await _get_active_session(body.session_id, db)
    await _verify_session_gm(session, current_user, db)

    # Check for existing active combat
    existing = await db.execute(
        select(CombatState).where(
            CombatState.session_id == body.session_id,
            CombatState.status == "active",
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Active combat already exists in this session",
        )

    # Build combatants dict keyed by combatant id
    combatants_dict = {}
    for c in body.combatants:
        cid = c.get("id", str(uuid.uuid4()))
        combatants_dict[cid] = c

    combat = CombatState(
        session_id=body.session_id,
        combatants=combatants_dict,
        initiative_order=[],
    )
    db.add(combat)
    await _log_combat_event(body.session_id, {"event": "combat_started", "combatant_count": len(body.combatants)}, db)
    await db.commit()
    await db.refresh(combat)
    return combat


@router.get("/{session_id}", response_model=CombatStateResponse)
async def get_combat_state(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current combat state for a session."""
    combat = await _get_combat(session_id, db)
    return combat


@router.post("/initiative", response_model=CombatStateResponse)
async def submit_initiative(
    body: InitiativeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit an initiative roll for a combatant."""
    combat = await _get_combat(body.session_id, db)

    combatants = dict(combat.combatants or {})
    if body.combatant_id not in combatants:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Combatant not found")

    # Calculate initiative value
    ini_value = body.ini_basis + body.roll
    combatants[body.combatant_id]["initiative"] = ini_value
    combatants[body.combatant_id]["ini_roll"] = body.roll
    combat.combatants = combatants

    # Re-sort initiative order (all combatants that have rolled)
    rolled = [(cid, c.get("initiative", 0)) for cid, c in combatants.items() if "initiative" in c]
    rolled.sort(key=lambda x: x[1], reverse=True)
    combat.initiative_order = [cid for cid, _ in rolled]

    await db.commit()
    await db.refresh(combat)
    return combat


@router.post("/action", response_model=ActionResultResponse)
async def declare_action(
    body: ActionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Declare a combat action (attack, defend, move, spell, etc.)."""
    combat = await _get_combat(body.session_id, db)

    combatants = dict(combat.combatants or {})
    if body.combatant_id not in combatants:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Combatant not found")

    valid_actions = ("attack", "defend", "move", "spell", "liturgy", "free", "use_item", "dodge", "parry")
    if body.action_type not in valid_actions:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"action_type must be one of {valid_actions}",
        )

    # Record the declared action (dice resolution happens via /combat/dice)
    action_record = {
        "action_type": body.action_type,
        "target_id": body.target_id,
        "details": body.details or {},
        "status": "pending_dice",
    }
    combatants[body.combatant_id]["pending_action"] = action_record
    combat.combatants = combatants

    await _log_combat_event(
        body.session_id,
        {"event": "action_declared", "combatant": body.combatant_id, "action": body.action_type},
        db,
    )
    await db.commit()
    await db.refresh(combat)

    return ActionResultResponse(
        success=True,
        combatant_id=body.combatant_id,
        action_type=body.action_type,
        result={"status": "pending_dice", "action": action_record},
        combat_state=CombatStateResponse.model_validate(combat),
    )


@router.post("/dice", response_model=ActionResultResponse)
async def submit_dice(
    body: DiceResultRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit dice results for a combat action and resolve it."""
    from engine import combat as combat_engine, damage as damage_engine

    combat_state = await _get_combat(body.session_id, db)
    combatants = dict(combat_state.combatants or {})

    if body.combatant_id not in combatants:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Combatant not found")

    combatant = combatants[body.combatant_id]
    result_data: dict[str, Any] = {
        "context": body.context,
        "rolls": body.rolls,
        "combatant_id": body.combatant_id,
    }

    if body.context == "attack":
        # Use engine to resolve attack
        at_value = combatant.get("at", 10)
        roll = body.rolls[0] if body.rolls else 10
        probe_result = combat_engine.resolve_attack(
            at_value=at_value,
            roll=roll,
            modifiers=body.details.get("modifiers") if body.details else None,
        )
        result_data["probe"] = probe_result
        combatant["last_attack_result"] = probe_result

    elif body.context == "defense":
        pa_value = combatant.get("pa", 5)
        roll = body.rolls[0] if body.rolls else 10
        probe_result = combat_engine.resolve_defense(
            defense_value=pa_value,
            roll=roll,
            defense_type=body.details.get("defense_type", "parry") if body.details else "parry",
            modifiers=body.details.get("modifiers") if body.details else None,
        )
        result_data["probe"] = probe_result

    elif body.context == "damage":
        damage_roll_total = sum(body.rolls)
        result_data["damage_total"] = damage_roll_total
        result_data["rolls"] = body.rolls

    else:
        result_data["raw_rolls"] = body.rolls

    combatants[body.combatant_id] = combatant
    combat_state.combatants = combatants

    await _log_combat_event(
        body.session_id,
        {"event": "dice_result", "combatant": body.combatant_id, "context": body.context, "result": result_data},
        db,
    )
    await db.commit()
    await db.refresh(combat_state)

    return ActionResultResponse(
        success=True,
        combatant_id=body.combatant_id,
        action_type=body.context,
        result=result_data,
        combat_state=CombatStateResponse.model_validate(combat_state),
    )


@router.post("/next-turn", response_model=CombatStateResponse)
async def next_turn(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Advance to the next combatant in initiative order (GM only)."""
    session = await _get_active_session(session_id, db)
    await _verify_session_gm(session, current_user, db)
    combat = await _get_combat(session_id, db)

    order = list(combat.initiative_order or [])
    if not order:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No initiative order set",
        )

    next_index = combat.current_turn_index + 1
    if next_index >= len(order):
        # New round
        next_index = 0
        combat.round_number += 1

    combat.current_turn_index = next_index

    # Clear pending actions for the new active combatant
    combatants = dict(combat.combatants or {})
    active_id = order[next_index]
    if active_id in combatants:
        combatants[active_id].pop("pending_action", None)
        combat.combatants = combatants

    await db.commit()
    await db.refresh(combat)
    return combat


@router.post("/end", response_model=CombatStateResponse)
async def end_combat(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """End combat (GM only)."""
    session = await _get_active_session(session_id, db)
    await _verify_session_gm(session, current_user, db)
    combat = await _get_combat(session_id, db)

    combat.status = "ended"
    await _log_combat_event(
        session_id,
        {"event": "combat_ended", "rounds": combat.round_number},
        db,
    )
    await db.commit()
    await db.refresh(combat)
    return combat


@router.post("/add-combatant", response_model=CombatStateResponse)
async def add_combatant(
    body: AddCombatantRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a combatant mid-combat (GM only)."""
    session = await _get_active_session(body.session_id, db)
    await _verify_session_gm(session, current_user, db)
    combat = await _get_combat(body.session_id, db)

    combatants = dict(combat.combatants or {})
    cid = body.combatant.get("id", str(uuid.uuid4()))
    if cid in combatants:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Combatant ID already exists")

    combatants[cid] = body.combatant
    combat.combatants = combatants

    await db.commit()
    await db.refresh(combat)
    return combat


@router.delete("/remove-combatant/{combatant_id}", response_model=CombatStateResponse)
async def remove_combatant(
    combatant_id: str,
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a combatant from combat (GM only)."""
    session = await _get_active_session(session_id, db)
    await _verify_session_gm(session, current_user, db)
    combat = await _get_combat(session_id, db)

    combatants = dict(combat.combatants or {})
    if combatant_id not in combatants:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Combatant not found")

    del combatants[combatant_id]
    combat.combatants = combatants

    # Remove from initiative order
    order = list(combat.initiative_order or [])
    if combatant_id in order:
        idx = order.index(combatant_id)
        order.remove(combatant_id)
        combat.initiative_order = order
        # Adjust turn index if needed
        if combat.current_turn_index >= len(order) and order:
            combat.current_turn_index = 0

    await db.commit()
    await db.refresh(combat)
    return combat


@router.put("/reorder", response_model=CombatStateResponse)
async def reorder_initiative(
    body: ReorderRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually reorder initiative (GM only)."""
    session = await _get_active_session(body.session_id, db)
    await _verify_session_gm(session, current_user, db)
    combat = await _get_combat(body.session_id, db)

    combat.initiative_order = body.initiative_order
    combat.current_turn_index = 0

    await db.commit()
    await db.refresh(combat)
    return combat

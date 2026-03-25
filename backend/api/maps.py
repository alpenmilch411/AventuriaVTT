"""Map CRUD, tokens, and trigger management endpoints."""

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
from models.campaign import Campaign
from models.map import GameMap, MapToken, MapTrigger

router = APIRouter(prefix="/api/maps", tags=["maps"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class MapCreate(BaseModel):
    name: str
    campaign_id: Optional[str] = None
    adventure_id: Optional[str] = None
    image_url: Optional[str] = None
    grid_config: Optional[dict] = None
    walls: Optional[list] = None
    difficult_terrain: Optional[list] = None
    initial_fog: Optional[bool] = True
    landmarks: Optional[list] = None


class MapUpdate(BaseModel):
    name: Optional[str] = None
    image_url: Optional[str] = None
    grid_config: Optional[dict] = None
    walls: Optional[list] = None
    difficult_terrain: Optional[list] = None
    initial_fog: Optional[bool] = None
    landmarks: Optional[list] = None


class MapTokenResponse(BaseModel):
    id: str
    map_id: str
    entity_type: str
    entity_id: Optional[str] = None
    name: Optional[str] = None
    icon_id: Optional[str] = None
    position_x: float
    position_y: float
    token_size: int
    visible_to_players: bool
    conditions: Optional[list] = None
    current_lep: Optional[int] = None
    max_lep: Optional[int] = None

    model_config = {"from_attributes": True}


class MapTriggerResponse(BaseModel):
    id: str
    map_id: str
    position_x: float
    position_y: float
    trigger_type: str
    name: Optional[str] = None
    gm_description: Optional[str] = None
    auto_probe: Optional[dict] = None
    on_trigger: Optional[dict] = None
    on_success: Optional[str] = None
    on_failure: Optional[str] = None
    visible_to_gm: bool
    revealed: bool
    one_shot: bool
    trigger_on: Optional[str] = None

    model_config = {"from_attributes": True}


class MapResponse(BaseModel):
    id: str
    name: str
    campaign_id: Optional[str] = None
    adventure_id: Optional[str] = None
    image_url: Optional[str] = None
    grid_config: Optional[dict] = None
    walls: Optional[list] = None
    difficult_terrain: Optional[list] = None
    initial_fog: Optional[bool] = None
    landmarks: Optional[list] = None
    created_at: datetime
    tokens: list[MapTokenResponse] = []
    triggers: list[MapTriggerResponse] = []

    model_config = {"from_attributes": True}


class TokenCreate(BaseModel):
    entity_type: str  # "player" | "creature" | "npc" | "item" | "landmark"
    entity_id: Optional[str] = None
    name: Optional[str] = None
    icon_id: Optional[str] = None
    position_x: float = 0.0
    position_y: float = 0.0
    token_size: int = 1
    visible_to_players: bool = True
    conditions: Optional[list] = None
    current_lep: Optional[int] = None
    max_lep: Optional[int] = None


class TokenUpdate(BaseModel):
    name: Optional[str] = None
    icon_id: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    token_size: Optional[int] = None
    visible_to_players: Optional[bool] = None
    conditions: Optional[list] = None
    current_lep: Optional[int] = None
    max_lep: Optional[int] = None


class TriggerCreate(BaseModel):
    position_x: float = 0.0
    position_y: float = 0.0
    trigger_type: str  # "trap" | "encounter" | "event" | "discovery"
    name: Optional[str] = None
    gm_description: Optional[str] = None
    auto_probe: Optional[dict] = None
    on_trigger: Optional[dict] = None
    on_success: Optional[str] = None
    on_failure: Optional[str] = None
    visible_to_gm: bool = True
    one_shot: bool = True
    trigger_on: Optional[str] = None


class TriggerUpdate(BaseModel):
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    trigger_type: Optional[str] = None
    name: Optional[str] = None
    gm_description: Optional[str] = None
    auto_probe: Optional[dict] = None
    on_trigger: Optional[dict] = None
    on_success: Optional[str] = None
    on_failure: Optional[str] = None
    visible_to_gm: Optional[bool] = None
    revealed: Optional[bool] = None
    one_shot: Optional[bool] = None
    trigger_on: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_map(map_id: str, db: AsyncSession) -> GameMap:
    result = await db.execute(select(GameMap).where(GameMap.id == map_id))
    game_map = result.scalar_one_or_none()
    if not game_map:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Map not found")
    return game_map


async def _verify_map_gm(game_map: GameMap, user: User, db: AsyncSession) -> None:
    """Verify the user is GM of the map's campaign."""
    if game_map.campaign_id:
        result = await db.execute(select(Campaign).where(Campaign.id == game_map.campaign_id))
        campaign = result.scalar_one_or_none()
        if not campaign or campaign.gm_user_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the campaign GM can modify this map")


# ---------------------------------------------------------------------------
# Map endpoints
# ---------------------------------------------------------------------------

@router.post("", response_model=MapResponse, status_code=status.HTTP_201_CREATED)
async def create_map(
    body: MapCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new map."""
    # If campaign_id is specified, verify GM
    if body.campaign_id:
        result = await db.execute(
            select(Campaign).where(
                Campaign.id == body.campaign_id,
                Campaign.gm_user_id == current_user.id,
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not GM of this campaign")

    game_map = GameMap(**body.model_dump())
    db.add(game_map)

    await db.commit()
    await db.refresh(game_map)
    return game_map


# IMPORTANT: Routes without path params must come BEFORE /{map_id} to avoid FastAPI matching "by-scene" as a map_id

@router.get("/by-scene/{scene_id}")
async def get_map_for_scene(
    scene_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get map data for a scene, including tokens and triggers."""
    from models.adventure import Scene
    scene = await db.execute(select(Scene).where(Scene.id == scene_id))
    scene = scene.scalar_one_or_none()
    if not scene or not scene.map_id:
        raise HTTPException(status_code=404, detail="No map for this scene")

    result = await db.execute(select(GameMap).where(GameMap.id == scene.map_id))
    game_map = result.scalar_one_or_none()
    if not game_map:
        raise HTTPException(status_code=404, detail="Map not found")

    tokens_result = await db.execute(select(MapToken).where(MapToken.map_id == game_map.id))
    tokens = tokens_result.scalars().all()

    triggers_result = await db.execute(select(MapTrigger).where(MapTrigger.map_id == game_map.id))
    triggers = triggers_result.scalars().all()

    return {
        "id": game_map.id,
        "name": game_map.name,
        "grid_config": game_map.grid_config,
        "walls": game_map.walls or [],
        "difficult_terrain": game_map.difficult_terrain or [],
        "landmarks": game_map.landmarks or [],
        "tokens": [
            {
                "id": t.id, "name": t.name, "entity_type": t.entity_type,
                "position_x": t.position_x, "position_y": t.position_y,
                "token_size": t.token_size, "visible_to_players": t.visible_to_players,
                "icon_id": t.icon_id, "current_lep": t.current_lep, "max_lep": t.max_lep,
            }
            for t in tokens
        ],
        "triggers": [
            {
                "id": tr.id, "name": tr.name, "trigger_type": tr.trigger_type,
                "position_x": tr.position_x, "position_y": tr.position_y,
                "gm_description": tr.gm_description,
            }
            for tr in triggers
        ],
    }


@router.get("/session/{session_code}/map")
async def get_session_map(
    session_code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current map for a session, including player tokens.
    GM gets everything. Players get only visible tokens."""
    from models.session_state import GameSession
    from models.campaign import Campaign, CampaignPlayer
    from models.adventure import Scene
    from models.character import Character

    # Find session -> campaign -> current scene -> map
    sess_result = await db.execute(select(GameSession).where(GameSession.session_code == session_code))
    session = sess_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    camp_result = await db.execute(select(Campaign).where(Campaign.id == session.campaign_id))
    campaign = camp_result.scalar_one_or_none()
    if not campaign or not campaign.current_scene_id:
        raise HTTPException(status_code=404, detail="No active scene")

    scene_result = await db.execute(select(Scene).where(Scene.id == campaign.current_scene_id))
    scene = scene_result.scalar_one_or_none()
    if not scene or not scene.map_id:
        raise HTTPException(status_code=404, detail="Scene has no map")

    # Get map data
    map_result = await db.execute(select(GameMap).where(GameMap.id == scene.map_id))
    game_map = map_result.scalar_one_or_none()
    if not game_map:
        raise HTTPException(status_code=404, detail="Map not found")

    tokens_result = await db.execute(select(MapToken).where(MapToken.map_id == game_map.id))
    map_tokens = list(tokens_result.scalars().all())

    triggers_result = await db.execute(select(MapTrigger).where(MapTrigger.map_id == game_map.id))
    triggers = list(triggers_result.scalars().all())

    # Get campaign players with characters for player tokens
    cp_result = await db.execute(
        select(CampaignPlayer).where(CampaignPlayer.campaign_id == session.campaign_id)
    )
    campaign_players = list(cp_result.scalars().all())

    player_tokens = []
    for cp in campaign_players:
        if not cp.character_id:
            continue
        char_result = await db.execute(select(Character).where(Character.id == cp.character_id))
        char = char_result.scalar_one_or_none()
        if not char:
            continue
        dv = char.derived_values or {}
        snapshot = cp.campaign_snapshot or {}
        cv = char.combat_values or {}
        weapons = cv.get("weapons", [])
        primary_weapon = weapons[0] if weapons else {}
        player_tokens.append({
            "id": f"player_{cp.user_id}",
            "name": char.name,
            "entity_type": "player",
            "position_x": snapshot.get("position_x", len(player_tokens) + 1),
            "position_y": snapshot.get("position_y", game_map.grid_config.get("height", 10) - 2),
            "token_size": 1,
            "visible_to_players": True,
            "icon_id": None,
            "user_id": cp.user_id,
            "character_id": cp.character_id,
            "current_lep": snapshot.get("current_lep", dv.get("LeP_max", 30)),
            "max_lep": dv.get("LeP_max", 30),
            "current_asp": snapshot.get("current_asp", dv.get("AsP_max", 0)),
            "max_asp": dv.get("AsP_max", 0),
            "species": char.species,
            "profession": char.profession,
            # Combat data for BattleManager
            "derived_values": dv,
            "combat_values": cv,
            "weaponName": primary_weapon.get("name", "Unbewaffnet"),
            "weaponDamage": primary_weapon.get("TP") or primary_weapon.get("damage", "1W6"),
            "weaponReach": primary_weapon.get("reach", "kurz"),
            "attacks": weapons,  # All weapons as attack options
        })

    is_gm = str(campaign.gm_user_id) == str(current_user.id)

    # Build token list
    all_tokens = []
    for t in map_tokens:
        # Players only see visible tokens
        if not is_gm and not t.visible_to_players:
            continue
        all_tokens.append({
            "id": t.id, "name": t.name, "entity_type": t.entity_type,
            "position_x": t.position_x, "position_y": t.position_y,
            "token_size": t.token_size, "visible_to_players": t.visible_to_players,
            "icon_id": t.icon_id, "current_lep": t.current_lep, "max_lep": t.max_lep,
        })
    all_tokens.extend(player_tokens)

    result = {
        "id": game_map.id,
        "name": game_map.name,
        "scene_id": scene.id,
        "scene_title": scene.title,
        "grid_config": game_map.grid_config,
        "walls": game_map.walls or [],
        "difficult_terrain": game_map.difficult_terrain or [],
        "tokens": all_tokens,
    }

    # GM sees triggers; players don't
    if is_gm:
        result["triggers"] = [
            {"id": tr.id, "name": tr.name, "trigger_type": tr.trigger_type,
             "position_x": tr.position_x, "position_y": tr.position_y,
             "gm_description": tr.gm_description}
            for tr in triggers
        ]
    else:
        result["triggers"] = []

    return result


@router.get("/{map_id}", response_model=MapResponse)
async def get_map(
    map_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a map with its tokens, triggers, and fog state."""
    game_map = await _get_map(map_id, db)
    return game_map


@router.put("/{map_id}", response_model=MapResponse)
async def update_map(
    map_id: str,
    body: MapUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update map properties (GM only)."""
    game_map = await _get_map(map_id, db)
    await _verify_map_gm(game_map, current_user, db)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(game_map, field, value)

    await db.commit()
    await db.refresh(game_map)
    return game_map


# ---------------------------------------------------------------------------
# Token endpoints
# ---------------------------------------------------------------------------

@router.post("/{map_id}/tokens", response_model=MapTokenResponse, status_code=status.HTTP_201_CREATED)
async def add_token(
    map_id: str,
    body: TokenCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a token to the map."""
    game_map = await _get_map(map_id, db)
    await _verify_map_gm(game_map, current_user, db)

    valid_types = ("player", "creature", "npc", "item", "landmark")
    if body.entity_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"entity_type must be one of {valid_types}",
        )

    token = MapToken(map_id=map_id, **body.model_dump())
    db.add(token)
    await db.commit()
    await db.refresh(token)
    return token


@router.put("/{map_id}/tokens/{token_id}", response_model=MapTokenResponse)
async def update_token(
    map_id: str,
    token_id: str,
    body: TokenUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a token (position, visibility, etc.)."""
    game_map = await _get_map(map_id, db)
    await _verify_map_gm(game_map, current_user, db)

    result = await db.execute(
        select(MapToken).where(MapToken.id == token_id, MapToken.map_id == map_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(token, field, value)

    await db.commit()
    await db.refresh(token)
    return token


@router.delete("/{map_id}/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_token(
    map_id: str,
    token_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a token from the map (GM only)."""
    game_map = await _get_map(map_id, db)
    await _verify_map_gm(game_map, current_user, db)

    result = await db.execute(
        select(MapToken).where(MapToken.id == token_id, MapToken.map_id == map_id)
    )
    token = result.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")

    await db.delete(token)
    await db.commit()


# ---------------------------------------------------------------------------
# Trigger endpoints
# ---------------------------------------------------------------------------

@router.post("/{map_id}/triggers", response_model=MapTriggerResponse, status_code=status.HTTP_201_CREATED)
async def add_trigger(
    map_id: str,
    body: TriggerCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a map trigger (GM only)."""
    game_map = await _get_map(map_id, db)
    await _verify_map_gm(game_map, current_user, db)

    valid_types = ("trap", "encounter", "event", "discovery")
    if body.trigger_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"trigger_type must be one of {valid_types}",
        )

    trigger = MapTrigger(map_id=map_id, **body.model_dump())
    db.add(trigger)
    await db.commit()
    await db.refresh(trigger)
    return trigger


@router.put("/{map_id}/triggers/{trigger_id}", response_model=MapTriggerResponse)
async def update_trigger(
    map_id: str,
    trigger_id: str,
    body: TriggerUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a map trigger (GM only)."""
    game_map = await _get_map(map_id, db)
    await _verify_map_gm(game_map, current_user, db)

    result = await db.execute(
        select(MapTrigger).where(MapTrigger.id == trigger_id, MapTrigger.map_id == map_id)
    )
    trigger = result.scalar_one_or_none()
    if not trigger:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trigger not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(trigger, field, value)

    await db.commit()
    await db.refresh(trigger)
    return trigger


@router.delete("/{map_id}/triggers/{trigger_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_trigger(
    map_id: str,
    trigger_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a map trigger (GM only)."""
    game_map = await _get_map(map_id, db)
    await _verify_map_gm(game_map, current_user, db)

    result = await db.execute(
        select(MapTrigger).where(MapTrigger.id == trigger_id, MapTrigger.map_id == map_id)
    )
    trigger = result.scalar_one_or_none()
    if not trigger:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trigger not found")

    await db.delete(trigger)
    await db.commit()

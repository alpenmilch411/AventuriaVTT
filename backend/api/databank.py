"""Databank reference data — browse, search, and homebrew endpoints."""

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from database import get_db
from models.user import User
from models.campaign import Campaign
from models.databank import (
    CreatureTemplate,
    WeaponTemplate,
    ArmorTemplate,
    ShieldTemplate,
    ItemTemplate,
    SpellTemplate,
    LiturgyTemplate,
    SpecialAbilityTemplate,
    TalentTemplate,
    CombatTechniqueTemplate,
    RulesSnippet,
)

router = APIRouter(prefix="/api/databank", tags=["databank"])


# ---------------------------------------------------------------------------
# Type -> Model mapping
# ---------------------------------------------------------------------------

TYPE_MODEL_MAP = {
    "creatures": CreatureTemplate,
    "weapons": WeaponTemplate,
    "armor": ArmorTemplate,
    "shields": ShieldTemplate,
    "items": ItemTemplate,
    "spells": SpellTemplate,
    "liturgies": LiturgyTemplate,
    "special_abilities": SpecialAbilityTemplate,
    "talents": TalentTemplate,
    "combat_techniques": CombatTechniqueTemplate,
    "rules": RulesSnippet,
}

VALID_TYPES = list(TYPE_MODEL_MAP.keys())


def _get_model(entity_type: str):
    model = TYPE_MODEL_MAP.get(entity_type)
    if not model:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid type '{entity_type}'. Must be one of: {VALID_TYPES}",
        )
    return model


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class DatabankListResponse(BaseModel):
    items: list[dict[str, Any]]
    total: int
    page: int
    page_size: int


class DatabankItemResponse(BaseModel):
    id: str
    name: str
    data: dict[str, Any]


class HomebrewCreateRequest(BaseModel):
    id: str
    name: str
    campaign_id: Optional[str] = None
    data: dict[str, Any] = {}


class HomebrewUpdateRequest(BaseModel):
    name: Optional[str] = None
    data: dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Helper — serialize a row to dict
# ---------------------------------------------------------------------------

def _row_to_dict(row) -> dict[str, Any]:
    """Convert a SQLAlchemy model instance to a dict."""
    result = {}
    for col in row.__table__.columns:
        val = getattr(row, col.name)
        if isinstance(val, uuid.UUID):
            val = str(val)
        result[col.name] = val
    return result


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/{entity_type}", response_model=DatabankListResponse)
async def list_entities(
    entity_type: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List databank entities with pagination."""
    model = _get_model(entity_type)

    # Count
    count_result = await db.execute(select(func.count()).select_from(model))
    total = count_result.scalar() or 0

    # Paginated query
    offset = (page - 1) * page_size
    result = await db.execute(
        select(model).offset(offset).limit(page_size)
    )
    rows = result.scalars().all()

    return DatabankListResponse(
        items=[_row_to_dict(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{entity_type}/search", response_model=DatabankListResponse)
async def search_entities(
    entity_type: str,
    q: str = Query(..., min_length=1, description="Search query"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Search databank entities by name or keywords."""
    model = _get_model(entity_type)
    search_pattern = f"%{q}%"

    # Build search conditions — all models have 'name'
    conditions = [model.name.ilike(search_pattern)]

    # Some models also have 'description' or 'category'
    if hasattr(model, "description"):
        conditions.append(model.description.ilike(search_pattern))
    if hasattr(model, "category"):
        conditions.append(model.category.ilike(search_pattern))
    if hasattr(model, "title"):
        conditions.append(model.title.ilike(search_pattern))

    where_clause = or_(*conditions)

    count_result = await db.execute(
        select(func.count()).select_from(model).where(where_clause)
    )
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        select(model).where(where_clause).offset(offset).limit(page_size)
    )
    rows = result.scalars().all()

    return DatabankListResponse(
        items=[_row_to_dict(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{entity_type}/{entity_id}", response_model=DatabankItemResponse)
async def get_entity(
    entity_type: str,
    entity_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single databank entity by ID."""
    model = _get_model(entity_type)
    result = await db.execute(select(model).where(model.id == entity_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{entity_type} '{entity_id}' not found")

    data = _row_to_dict(row)
    return DatabankItemResponse(
        id=data.pop("id"),
        name=data.pop("name"),
        data=data,
    )


@router.post("/{entity_type}", response_model=DatabankItemResponse, status_code=status.HTTP_201_CREATED)
async def create_homebrew(
    entity_type: str,
    body: HomebrewCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a homebrew entry (GM only, scoped to campaign)."""
    model = _get_model(entity_type)

    # If campaign_id provided, verify user is GM
    if body.campaign_id:
        campaign_result = await db.execute(
            select(Campaign).where(
                Campaign.id == body.campaign_id,
                Campaign.gm_user_id == current_user.id,
            )
        )
        if not campaign_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Must be GM of the campaign")

    # Check for duplicate ID
    existing = await db.execute(select(model).where(model.id == body.id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"ID '{body.id}' already exists")

    # Build the row from id, name, and extra data fields
    row_data = {"id": body.id, "name": body.name}
    # Map extra data fields to model columns
    for col in model.__table__.columns:
        if col.name in ("id", "name"):
            continue
        if col.name in body.data:
            row_data[col.name] = body.data[col.name]

    row = model(**row_data)
    db.add(row)
    await db.commit()
    await db.refresh(row)

    data = _row_to_dict(row)
    return DatabankItemResponse(
        id=data.pop("id"),
        name=data.pop("name"),
        data=data,
    )


@router.put("/{entity_type}/{entity_id}", response_model=DatabankItemResponse)
async def update_homebrew(
    entity_type: str,
    entity_id: str,
    body: HomebrewUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a homebrew entry."""
    model = _get_model(entity_type)
    result = await db.execute(select(model).where(model.id == entity_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{entity_type} '{entity_id}' not found")

    if body.name is not None:
        row.name = body.name

    for col in model.__table__.columns:
        if col.name in ("id", "name"):
            continue
        if col.name in body.data:
            setattr(row, col.name, body.data[col.name])

    await db.commit()
    await db.refresh(row)

    data = _row_to_dict(row)
    return DatabankItemResponse(
        id=data.pop("id"),
        name=data.pop("name"),
        data=data,
    )


@router.get("/creatures/by-name/{name}")
async def get_creature_by_name(
    name: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Look up creature template by partial name match."""
    result = await db.execute(
        select(CreatureTemplate).where(CreatureTemplate.name.ilike(f"%{name}%"))
    )
    creature = result.scalars().first()
    if not creature:
        raise HTTPException(status_code=404, detail="Creature not found")
    return {
        "id": creature.id, "name": creature.name,
        "category": creature.category, "size": creature.size,
        "description": creature.description,
        "attributes": creature.attributes,
        "combat_values": creature.combat_values,
        "attacks": creature.attacks,
        "special_rules": creature.special_rules,
        "behavior": creature.behavior,
        "tactics": creature.tactics,
        "challenge_rating": creature.challenge_rating,
    }

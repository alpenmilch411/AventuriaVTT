"""Databank reference data — browse, search, and user-contributed entries."""

import json
import uuid
from collections import Counter
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from database import get_db
from models.user import User
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
    SpeciesTemplate,
    CultureTemplate,
    ProfessionTemplate,
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
    "species": SpeciesTemplate,
    "cultures": CultureTemplate,
    "professions": ProfessionTemplate,
}

# Categories that support user-contribution fields
_USER_CONTRIB_CATEGORIES = {
    "creatures", "weapons", "armor", "shields", "items",
    "spells", "liturgies", "special_abilities", "talents",
    "species", "cultures", "professions",
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


def _supports_custom(entity_type: str) -> bool:
    return entity_type in _USER_CONTRIB_CATEGORIES


# Maps entity type → the DB column used as subcategory filter
SUBCATEGORY_FIELD: dict[str, str] = {
    "creatures":         "category",
    "weapons":           "combat_technique",
    "items":             "category",
    "spells":            "tradition",
    "liturgies":         "tradition",
    "special_abilities": "category",
    "talents":           "category",
    "combat_techniques": "category",
}


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
    search: Optional[str] = Query(None, min_length=1, description="Filter by name LIKE"),
    custom_only: bool = Query(False, description="Show only user-contributed entries"),
    subcategory: Optional[str] = Query(None, description="Filter by subcategory value"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List databank entities with pagination, search, and filtering."""
    model = _get_model(entity_type)

    # Build WHERE conditions
    conditions = []

    # Search filter
    if search:
        search_pattern = f"%{search}%"
        search_conds = [model.name.ilike(search_pattern)]
        if hasattr(model, "description"):
            search_conds.append(model.description.ilike(search_pattern))
        if hasattr(model, "category"):
            search_conds.append(model.category.ilike(search_pattern))
        if hasattr(model, "title"):
            search_conds.append(model.title.ilike(search_pattern))
        conditions.append(or_(*search_conds))

    # Custom-only filter
    if custom_only and _supports_custom(entity_type):
        conditions.append(model.is_custom == True)  # noqa: E712

    # Subcategory filter
    if subcategory:
        subcat_field = SUBCATEGORY_FIELD.get(entity_type)
        if subcat_field and hasattr(model, subcat_field):
            col = getattr(model, subcat_field)
            if subcat_field == "tradition":
                # tradition is stored as JSON array string, e.g. '["Gildenmagier"]'
                conditions.append(col.ilike(f'%"{subcategory}"%'))
            else:
                conditions.append(col == subcategory)

    # Count
    count_q = select(func.count()).select_from(model)
    if conditions:
        count_q = count_q.where(*conditions)
    count_result = await db.execute(count_q)
    total = count_result.scalar() or 0

    # Paginated query
    offset = (page - 1) * page_size
    query = select(model).offset(offset).limit(page_size)
    if conditions:
        query = query.where(*conditions)
    result = await db.execute(query)
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


@router.get("/{entity_type}/subcategories")
async def list_subcategories(
    entity_type: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return distinct subcategory values with counts for the given entity type."""
    subcat_field = SUBCATEGORY_FIELD.get(entity_type)
    if not subcat_field:
        return []

    model = _get_model(entity_type)
    if not hasattr(model, subcat_field):
        return []

    col = getattr(model, subcat_field)
    result = await db.execute(select(col).where(col.isnot(None)))
    raw_values = result.scalars().all()

    counter: Counter = Counter()
    is_tradition = subcat_field == "tradition"

    for val in raw_values:
        if not val:
            continue
        if is_tradition:
            try:
                parsed = json.loads(val)
                items = parsed if isinstance(parsed, list) else [str(parsed)]
                for t in items:
                    counter[str(t)] += 1
            except (json.JSONDecodeError, TypeError):
                counter[str(val)] += 1
        else:
            counter[str(val)] += 1

    return [{"value": k, "count": v} for k, v in sorted(counter.items(), key=lambda x: -x[1])]


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
async def create_entry(
    entity_type: str,
    body: HomebrewCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a user-contributed databank entry."""
    model = _get_model(entity_type)

    if not _supports_custom(entity_type):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Category '{entity_type}' does not support user-contributed entries",
        )

    # Check for duplicate ID
    existing = await db.execute(select(model).where(model.id == body.id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"ID '{body.id}' already exists")

    # Build the row from id, name, user-contribution fields, and extra data
    row_data = {
        "id": body.id,
        "name": body.name,
        "is_custom": True,
        "created_by_user_id": str(current_user.id),
        "created_by_username": current_user.username,
    }
    # Map extra data fields to model columns
    for col in model.__table__.columns:
        if col.name in ("id", "name", "is_custom", "created_by_user_id", "created_by_username"):
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
async def update_entry(
    entity_type: str,
    entity_id: str,
    body: HomebrewUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a user-contributed databank entry. Only the creator can edit."""
    model = _get_model(entity_type)

    if not _supports_custom(entity_type):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Category '{entity_type}' does not support user-contributed entries",
        )

    result = await db.execute(select(model).where(model.id == entity_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{entity_type} '{entity_id}' not found")

    # System entries cannot be edited
    if not row.is_custom:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="System entries cannot be edited")

    # Only the creator can edit
    if row.created_by_user_id != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the creator can edit this entry")

    if body.name is not None:
        row.name = body.name

    for col in model.__table__.columns:
        if col.name in ("id", "name", "is_custom", "created_by_user_id", "created_by_username"):
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


@router.delete("/{entity_type}/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(
    entity_type: str,
    entity_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a user-contributed databank entry. Only the creator can delete."""
    model = _get_model(entity_type)

    if not _supports_custom(entity_type):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Category '{entity_type}' does not support user-contributed entries",
        )

    result = await db.execute(select(model).where(model.id == entity_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{entity_type} '{entity_id}' not found")

    # System entries cannot be deleted
    if not row.is_custom:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="System entries cannot be deleted")

    # Only the creator can delete
    if row.created_by_user_id != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the creator can delete this entry")

    await db.delete(row)
    await db.commit()


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

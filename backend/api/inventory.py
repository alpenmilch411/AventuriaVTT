"""Inventory management — personal inventory endpoints."""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from database import get_db
from models.user import User
from models.character import Character
from models.inventory import InventoryItem

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class InventoryItemResponse(BaseModel):
    id: str
    character_id: Optional[str] = None
    item_template_id: Optional[str] = None
    name: str
    quantity: int
    equipped: bool
    properties: Optional[dict] = None
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


class AddItemRequest(BaseModel):
    name: str
    quantity: int = 1
    item_template_id: Optional[str] = None
    equipped: bool = False
    properties: Optional[dict] = None
    notes: Optional[str] = None


class UseItemRequest(BaseModel):
    item_id: str
    quantity: int = 1


class TransferRequest(BaseModel):
    item_id: str
    target_character_id: str
    quantity: int = 1


class EquipRequest(BaseModel):
    item_id: str
    equipped: bool


class DropItemRequest(BaseModel):
    item_id: str
    quantity: int = 1
    map_id: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None


class ExchangeItem(BaseModel):
    name: str
    quantity: int = 1
    template_id: Optional[str] = None


class ExchangeMoney(BaseModel):
    dukaten: int = 0
    silber: int = 0
    heller: int = 0
    kreuzer: int = 0


class ExecuteExchangeRequest(BaseModel):
    """Execute a transfer or trade between two characters.

    For a one-way transfer (gift), only populate from_items/from_money.
    For a two-way trade, populate both sides.
    """
    from_character_id: str
    to_character_id: str
    from_items: list[ExchangeItem] = []
    from_money: Optional[ExchangeMoney] = None
    to_items: list[ExchangeItem] = []       # what B gives to A (trade only)
    to_money: Optional[ExchangeMoney] = None  # what B gives to A (trade only)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _verify_character_access(
    character_id: str, user: User, db: AsyncSession
) -> Character:
    """Load the character and verify the caller owns it.

    TODO(#2/#3): GM mid-session auth via SessionPlayer membership.
    Campaign-GM bypass removed 2026-04-17 (issue #1).
    """
    result = await db.execute(select(Character).where(Character.id == character_id))
    char = result.scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")
    if char.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    return char


async def _get_item(item_id: str, character_id: str, db: AsyncSession) -> InventoryItem:
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.id == item_id,
            InventoryItem.character_id == character_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found in inventory")
    return item


# ---------------------------------------------------------------------------
# Personal inventory endpoints
# ---------------------------------------------------------------------------

@router.get("/{character_id}", response_model=list[InventoryItemResponse])
async def get_inventory(
    character_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a character's inventory (enriched with template data)."""
    await _verify_character_access(character_id, current_user, db)
    result = await db.execute(
        select(InventoryItem).where(InventoryItem.character_id == character_id)
    )
    items = result.scalars().all()

    # Enrich items that have a template_id
    from utils.inventory_enrichment import enrich_inventory_items
    item_dicts = [
        {
            "id": it.id,
            "character_id": it.character_id,
            "item_template_id": it.item_template_id,
            "name": it.name,
            "quantity": it.quantity,
            "equipped": it.equipped,
            "properties": it.properties,
            "notes": it.notes,
            "template_id": it.item_template_id,  # alias for enrichment lookup
        }
        for it in items
    ]
    enriched = await enrich_inventory_items(item_dicts, db)
    return enriched


@router.post("/{character_id}/add", response_model=InventoryItemResponse, status_code=status.HTTP_201_CREATED)
async def add_item(
    character_id: str,
    body: AddItemRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add an item to a character's inventory. Stacks with existing items of same template_id or name."""
    await _verify_character_access(character_id, current_user, db)

    # Check if item already exists — stack quantities instead of creating duplicates
    # Match by template_id first, fall back to name for legacy data
    existing = None
    if body.item_template_id:
        existing_result = await db.execute(
            select(InventoryItem).where(
                InventoryItem.character_id == character_id,
                InventoryItem.item_template_id == body.item_template_id,
            )
        )
        existing = existing_result.scalar_one_or_none()
    if not existing:
        existing_result = await db.execute(
            select(InventoryItem).where(
                InventoryItem.character_id == character_id,
                InventoryItem.name == body.name,
            )
        )
        existing = existing_result.scalar_one_or_none()
    if existing:
        existing.quantity += body.quantity
        if body.properties and not existing.properties:
            existing.properties = body.properties
        # Backfill template_id on legacy items
        if body.item_template_id and not existing.item_template_id:
            existing.item_template_id = body.item_template_id
        await db.commit()
        await db.refresh(existing)
        return existing

    item = InventoryItem(
        character_id=character_id,
        name=body.name,
        quantity=body.quantity,
        item_template_id=body.item_template_id,
        equipped=body.equipped,
        properties=body.properties,
        notes=body.notes,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.post("/{character_id}/use", response_model=InventoryItemResponse)
async def use_item(
    character_id: str,
    body: UseItemRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Use (consume) an item, reducing quantity."""
    await _verify_character_access(character_id, current_user, db)
    item = await _get_item(body.item_id, character_id, db)

    if item.quantity < body.quantity:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Not enough quantity: have {item.quantity}, want to use {body.quantity}",
        )

    item.quantity -= body.quantity
    if item.quantity <= 0:
        await db.delete(item)
        await db.commit()
        # Return the item with 0 quantity
        return InventoryItemResponse(
            id=item.id,
            character_id=item.character_id,
            name=item.name,
            quantity=0,
            equipped=False,
            item_template_id=item.item_template_id,
            properties=item.properties,
            notes=item.notes,
        )

    await db.commit()
    await db.refresh(item)
    return item


@router.post("/{character_id}/transfer", response_model=InventoryItemResponse)
async def transfer_item(
    character_id: str,
    body: TransferRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Transfer an item to another character."""
    await _verify_character_access(character_id, current_user, db)
    item = await _get_item(body.item_id, character_id, db)

    # Verify target character exists
    target_result = await db.execute(select(Character).where(Character.id == body.target_character_id))
    if not target_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target character not found")

    if body.quantity >= item.quantity:
        # Transfer entire stack
        item.character_id = body.target_character_id
        item.equipped = False
        await db.commit()
        await db.refresh(item)
        return item
    else:
        # Split stack
        item.quantity -= body.quantity
        new_item = InventoryItem(
            character_id=body.target_character_id,
            name=item.name,
            quantity=body.quantity,
            item_template_id=item.item_template_id,
            properties=item.properties,
            notes=item.notes,
        )
        db.add(new_item)
        await db.commit()
        await db.refresh(new_item)
        return new_item


@router.post("/{character_id}/equip", response_model=InventoryItemResponse)
async def equip_item(
    character_id: str,
    body: EquipRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Equip or unequip an item."""
    await _verify_character_access(character_id, current_user, db)
    item = await _get_item(body.item_id, character_id, db)

    item.equipped = body.equipped
    await db.commit()
    await db.refresh(item)
    return item


@router.post("/{character_id}/drop", response_model=dict)
async def drop_item(
    character_id: str,
    body: DropItemRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Drop an item (remove from inventory, optionally place on map)."""
    await _verify_character_access(character_id, current_user, db)
    item = await _get_item(body.item_id, character_id, db)

    dropped_quantity = min(body.quantity, item.quantity)

    if dropped_quantity >= item.quantity:
        await db.delete(item)
    else:
        item.quantity -= dropped_quantity

    # If map placement is requested, create a map token (handled by map system)
    result = {
        "dropped": True,
        "item_name": item.name,
        "quantity": dropped_quantity,
    }
    if body.map_id:
        result["map_id"] = str(body.map_id)
        result["position"] = {"x": body.position_x, "y": body.position_y}

    await db.commit()
    return result


# ---------------------------------------------------------------------------
# Exchange execution (transfer / trade)
# ---------------------------------------------------------------------------

def _normalize_inv(raw) -> dict:
    """Normalize basis_inventory to {items: [...], purse: {...}} format."""
    if raw is None:
        return {"items": [], "purse": {}}
    if isinstance(raw, list):
        return {"items": list(raw), "purse": {}}
    inv = dict(raw)
    if "items" not in inv:
        inv["items"] = []
    if "purse" not in inv:
        inv["purse"] = {}
    return inv


def _remove_items_from_inventory(inv: dict, items: list[dict], money: Optional[dict]) -> dict:
    """Remove items and money from a basis_inventory dict. Returns modified copy."""
    inv = dict(inv)  # shallow copy
    item_list = list(inv.get("items", []))

    for req in items:
        name, qty = req["name"], req["quantity"]
        tid = req.get("template_id")
        for idx, it in enumerate(item_list):
            # Match by template_id first, fall back to name for legacy data
            if (tid and it.get("template_id") == tid) or it.get("name") == name:
                if it.get("quantity", 1) <= qty:
                    item_list.pop(idx)
                else:
                    item_list[idx] = {**it, "quantity": it["quantity"] - qty}
                break

    if money:
        purse = dict(inv.get("purse", {}))
        for denom in ("dukaten", "silber", "heller", "kreuzer"):
            purse[denom] = purse.get(denom, 0) - getattr(money, denom, 0) if hasattr(money, denom) else purse.get(denom, 0) - money.get(denom, 0)
        inv["purse"] = purse

    inv["items"] = item_list
    return inv


def _add_items_to_inventory(inv: dict, items: list[dict], money: Optional[dict]) -> dict:
    """Add items and money to a basis_inventory dict. Returns modified copy."""
    inv = dict(inv)
    item_list = list(inv.get("items", []))

    for req in items:
        name, qty = req["name"], req["quantity"]
        tid = req.get("template_id")
        found = False
        for idx, it in enumerate(item_list):
            # Match by template_id first, fall back to name for legacy data
            if (tid and it.get("template_id") == tid) or it.get("name") == name:
                item_list[idx] = {**it, "quantity": it.get("quantity", 1) + qty}
                found = True
                break
        if not found:
            new_item = {k: v for k, v in req.items()}
            new_item.setdefault("equipped", False)
            new_item["quantity"] = qty
            item_list.append(new_item)

    if money:
        purse = dict(inv.get("purse", {}))
        for denom in ("dukaten", "silber", "heller", "kreuzer"):
            purse[denom] = purse.get(denom, 0) + (getattr(money, denom, 0) if hasattr(money, denom) else money.get(denom, 0))
        inv["purse"] = purse

    inv["items"] = item_list
    return inv


@router.post("/execute-exchange", response_model=dict)
async def execute_exchange(
    body: ExecuteExchangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Execute an item/money exchange between two characters.

    Narrowed to owner-only on BOTH sides. Cross-owner trades use the WS trade
    flow (proposer → GM approval → broadcast). TODO(#2/#3): session-scoped
    GM auth for REST cross-owner trades.
    """
    # Self-exchange rejection (before DB round-trips)
    if body.from_character_id == body.to_character_id:
        raise HTTPException(status_code=400, detail="Cannot exchange with self")

    # Load both characters
    from_result = await db.execute(select(Character).where(Character.id == body.from_character_id))
    from_char = from_result.scalar_one_or_none()
    if not from_char:
        raise HTTPException(status_code=404, detail="Source character not found")

    to_result = await db.execute(select(Character).where(Character.id == body.to_character_id))
    to_char = to_result.scalar_one_or_none()
    if not to_char:
        raise HTTPException(status_code=404, detail="Target character not found")

    # Both-sides-owned narrowing. TODO(#2/#3): session-scoped GM auth for cross-owner trades.
    if from_char.user_id != current_user.id or to_char.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Exchange requires ownership of both characters; cross-owner trades use the WS trade flow.",
        )

    # Perform the exchange on basis_inventory
    from_inv = _normalize_inv(from_char.basis_inventory)
    to_inv = _normalize_inv(to_char.basis_inventory)

    # A gives to B
    from_items_dicts = [{"name": it.name, "quantity": it.quantity, "template_id": it.template_id} for it in body.from_items]
    from_money_dict = body.from_money
    from_inv = _remove_items_from_inventory(from_inv, from_items_dicts, from_money_dict)
    to_inv = _add_items_to_inventory(to_inv, from_items_dicts, from_money_dict)

    # B gives to A (trade only)
    if body.to_items or body.to_money:
        to_items_dicts = [{"name": it.name, "quantity": it.quantity, "template_id": it.template_id} for it in body.to_items]
        to_money_dict = body.to_money
        to_inv = _remove_items_from_inventory(to_inv, to_items_dicts, to_money_dict)
        from_inv = _add_items_to_inventory(from_inv, to_items_dicts, to_money_dict)

    # Persist
    from_char.basis_inventory = from_inv
    to_char.basis_inventory = to_inv
    await db.commit()

    return {
        "status": "ok",
        "from_character_id": body.from_character_id,
        "from_inventory": from_inv,
        "to_character_id": body.to_character_id,
        "to_inventory": to_inv,
    }

"""Inventory enrichment — join thin inventory items with databank templates.

Thin items stored in DB: {template_id, quantity, equipped}
Enriched items served to clients: all template fields merged in.
"""

import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.databank import WeaponTemplate, ArmorTemplate, ShieldTemplate, ItemTemplate

logger = logging.getLogger("aventuria.inventory")

# Template table lookup order — first match wins
_TEMPLATE_TABLES = [
    ("weapon", WeaponTemplate),
    ("armor", ArmorTemplate),
    ("shield", ShieldTemplate),
    ("item", ItemTemplate),
]

# Fields to extract per template type
_WEAPON_FIELDS = (
    "name", "icon_id", "combat_technique", "damage", "at_mod", "pa_mod",
    "reach", "weight", "price", "two_handed", "properties", "damage_type",
    "is_ranged", "range_brackets", "reload_time", "ammunition", "availability",
    "description",
)
_ARMOR_FIELDS = (
    "name", "icon_id", "rs", "be", "weight", "price", "zones", "properties",
    "description",
)
_SHIELD_FIELDS = (
    "name", "icon_id", "at_mod", "pa_mod", "weight", "price", "size",
    "description",
)
_ITEM_FIELDS = (
    "name", "icon_id", "category", "weight", "price", "stackable", "max_stack",
    "usable", "usable_in_combat", "use_action_cost", "effects", "consumable",
    "charges", "description",
)

_FIELDS_BY_TYPE = {
    "weapon": _WEAPON_FIELDS,
    "armor": _ARMOR_FIELDS,
    "shield": _SHIELD_FIELDS,
    "item": _ITEM_FIELDS,
}


def _extract_template_fields(template, template_type: str) -> dict:
    """Extract relevant fields from a SQLAlchemy template model instance."""
    fields = _FIELDS_BY_TYPE.get(template_type, ())
    result = {}
    for f in fields:
        val = getattr(template, f, None)
        if val is not None:
            result[f] = val
    return result


async def enrich_inventory_items(
    items: list[dict],
    db: AsyncSession,
) -> list[dict]:
    """Enrich a list of thin inventory items with template data.

    Each item should have at minimum {template_id, quantity, equipped}.
    Items without template_id are returned as-is (legacy compatibility).
    Items whose template_id doesn't match any template are returned as-is
    with a _warning field.

    Returns a new list — does not mutate the input.
    """
    if not items:
        return []

    # Collect all template_ids that need lookup
    template_ids = {it.get("template_id") for it in items if it.get("template_id")}
    if not template_ids:
        # Nothing to enrich — all legacy items
        return [dict(it) for it in items]

    # Batch-load from all template tables
    templates: dict[str, tuple[str, object]] = {}  # template_id -> (type, model)
    for ttype, model_cls in _TEMPLATE_TABLES:
        remaining = template_ids - set(templates.keys())
        if not remaining:
            break
        result = await db.execute(
            select(model_cls).where(model_cls.id.in_(remaining))
        )
        for tmpl in result.scalars().all():
            templates[tmpl.id] = (ttype, tmpl)

    # Enrich each item
    enriched = []
    for item in items:
        out = dict(item)  # shallow copy
        tid = item.get("template_id")
        if not tid:
            # Legacy item without template_id — pass through as-is
            enriched.append(out)
            continue

        match = templates.get(tid)
        if not match:
            out["_warning"] = f"template not found: {tid}"
            enriched.append(out)
            continue

        ttype, tmpl = match
        # Merge template fields (item fields take precedence for overrides)
        template_data = _extract_template_fields(tmpl, ttype)
        # Template data goes first, item-specific overrides go on top
        merged = {**template_data, **out}
        merged["_type"] = ttype
        enriched.append(merged)

    return enriched


async def enrich_basis_inventory(
    basis_inventory: Optional[dict],
    db: AsyncSession,
) -> Optional[dict]:
    """Enrich the items list inside a basis_inventory dict.

    basis_inventory shape: {items: [...], purse: {...}}
    Returns a new dict with enriched items. Purse is passed through unchanged.
    Returns None if input is None.
    """
    if basis_inventory is None:
        return None

    inv = dict(basis_inventory)
    raw_items = inv.get("items", [])
    if raw_items:
        inv["items"] = await enrich_inventory_items(raw_items, db)
    return inv


def thin_inventory_item(item: dict) -> dict:
    """Strip an inventory item down to its thin storage form.

    Keeps only: template_id, quantity, equipped, and name (fallback for legacy).
    """
    thin = {}
    if item.get("template_id"):
        thin["template_id"] = item["template_id"]
    if item.get("name"):
        thin["name"] = item["name"]
    thin["quantity"] = item.get("quantity", 1)
    thin["equipped"] = item.get("equipped", False)
    return thin


def thin_basis_inventory(basis_inventory: Optional[dict]) -> Optional[dict]:
    """Strip a full basis_inventory down to thin storage form.

    Keeps purse as-is, thins each item in items list.
    """
    if basis_inventory is None:
        return None

    inv = dict(basis_inventory)
    raw_items = inv.get("items", [])
    if raw_items:
        inv["items"] = [thin_inventory_item(it) for it in raw_items]
    return inv


def validate_inventory_payload(payload: dict) -> tuple[bool, str]:
    """Validate an inventory_change WS payload.

    Returns (is_valid, error_message).
    """
    inventory = payload.get("inventory")
    if not isinstance(inventory, dict):
        return False, "inventory must be a dict"

    items = inventory.get("items")
    if items is not None and not isinstance(items, list):
        return False, "inventory.items must be a list"

    if items:
        for i, item in enumerate(items):
            if not isinstance(item, dict):
                return False, f"inventory.items[{i}] must be a dict"
            # template_id is preferred but not required (legacy items may only have name)
            if not item.get("template_id") and not item.get("name"):
                return False, f"inventory.items[{i}] must have template_id or name"
            qty = item.get("quantity")
            if qty is not None and (not isinstance(qty, int) or qty < 0):
                return False, f"inventory.items[{i}].quantity must be a non-negative integer"

    return True, ""

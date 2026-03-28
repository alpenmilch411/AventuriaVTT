"""Character CRUD, import, export, and level-up endpoints."""

import json
import math
import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from database import get_db
from models.user import User
from models.character import Character

router = APIRouter(prefix="/api/characters", tags=["characters"])


def _recompute_derived(attributes: dict, spells: dict, liturgies: dict, existing: dict) -> dict:
    """Recompute derived values from raw attributes after a level-up.

    Keeps GS and SchiP from existing (species-specific), only recomputes
    attribute-driven values: LeP_max, AsP_max, KaP_max, INI_basis, AW, WS, SB, SK, ZK.
    """
    a = attributes or {}
    mu = a.get("MU", 8)
    kl = a.get("KL", 8)
    in_ = a.get("IN", 8)
    ch = a.get("CH", 8)
    ge = a.get("GE", 8)
    ko = a.get("KO", 8)
    kk = a.get("KK", 8)

    result = dict(existing or {})
    lep_base = result.get("lep_base", 0)
    result["LeP_max"] = lep_base + ko * 2
    result["INI_basis"] = (mu + ge) // 2
    result["AW"] = ge // 2
    result["WS"] = math.ceil(ko / 2)
    result["SB"] = max(0, (kk - 15) // 3)
    result["SK"] = (mu + kl + in_) // 3 + result.get("SK_modifier", 0)
    result["ZK"] = (ko + ko + kk) // 3 + result.get("ZK_modifier", 0)

    is_magic = bool(spells)
    is_blessed = bool(liturgies)
    result["AsP_max"] = (20 + round((mu + in_ + ch) / 3)) if is_magic else 0
    result["KaP_max"] = (20 + round((mu + kl + in_) / 3)) if is_blessed else 0

    return result


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class CharacterCreate(BaseModel):
    name: str
    species: Optional[str] = None
    species_variant: Optional[str] = None
    profession: Optional[str] = None
    profession_variant: Optional[str] = None
    culture: Optional[str] = None
    experience_grade: Optional[str] = None
    total_ap: int = 0
    available_ap: int = 0
    portrait_url: Optional[str] = None
    bio: Optional[str] = None
    attributes: Optional[dict] = None
    derived_values: Optional[dict] = None
    combat_values: Optional[dict] = None
    combat_techniques: Optional[dict] = None
    talents: Optional[dict] = None
    spells: Optional[dict] = None
    liturgies: Optional[dict] = None
    special_abilities: Optional[list] = None
    advantages: Optional[Any] = None
    disadvantages: Optional[Any] = None
    languages: Optional[list] = None
    basis_inventory: Optional[dict] = None
    current_vitals: Optional[dict] = None


class CharacterUpdate(BaseModel):
    name: Optional[str] = None
    species: Optional[str] = None
    species_variant: Optional[str] = None
    profession: Optional[str] = None
    profession_variant: Optional[str] = None
    culture: Optional[str] = None
    experience_grade: Optional[str] = None
    total_ap: Optional[int] = None
    available_ap: Optional[int] = None
    status: Optional[str] = None
    portrait_url: Optional[str] = None
    bio: Optional[str] = None
    attributes: Optional[dict] = None
    derived_values: Optional[dict] = None
    combat_values: Optional[dict] = None
    combat_techniques: Optional[dict] = None
    talents: Optional[dict] = None
    spells: Optional[dict] = None
    liturgies: Optional[dict] = None
    special_abilities: Optional[list] = None
    advantages: Optional[dict] = None
    disadvantages: Optional[dict] = None
    languages: Optional[list] = None
    basis_inventory: Optional[dict] = None
    death_record: Optional[dict] = None


class CharacterResponse(BaseModel):
    id: str
    user_id: str
    name: str
    species: Optional[str] = None
    species_variant: Optional[str] = None
    profession: Optional[str] = None
    profession_variant: Optional[str] = None
    culture: Optional[str] = None
    experience_grade: Optional[str] = None
    total_ap: int
    available_ap: int
    status: str
    portrait_url: Optional[str] = None
    bio: Optional[str] = None
    attributes: Optional[dict] = None
    derived_values: Optional[dict] = None
    combat_values: Optional[dict] = None
    combat_techniques: Optional[dict] = None
    talents: Optional[dict] = None
    spells: Optional[dict] = None
    liturgies: Optional[dict] = None
    special_abilities: Optional[list] = None
    advantages: Optional[list] = None
    disadvantages: Optional[list] = None
    languages: Optional[list] = None
    basis_inventory: Optional[Any] = None
    current_vitals: Optional[dict] = None
    conditions: Optional[list] = None
    active_buffs: Optional[list] = None
    death_record: Optional[dict] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CharacterListResponse(BaseModel):
    id: str
    name: str
    species: Optional[str] = None
    profession: Optional[str] = None
    experience_grade: Optional[str] = None
    status: str
    total_ap: int
    available_ap: int
    portrait_url: Optional[str] = None
    locked_session_id: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class LevelUpRequest(BaseModel):
    upgrades: list[dict[str, Any]]
    """
    Each upgrade: {
        "type": "attribute" | "talent" | "spell" | "liturgy" | "combat_technique" | "special_ability",
        "id": "MU" | "Klettern" | ...,
        "from_value": int (optional, for validation),
        "to_value": int (optional, for single-step the engine figures it out),
    }
    """


class LevelUpResponse(BaseModel):
    character_id: str
    ap_spent: int
    remaining_ap: int
    upgrades_applied: list[dict[str, Any]]
    warnings: list[str]


class QuickTemplateRequest(BaseModel):
    archetype: str  # "Krieger" | "Magier" | "Geweihter" | ...
    name: str
    experience_grade: Optional[str] = "erfahren"


class ImportResponse(BaseModel):
    character_id: str
    name: str
    source_format: str  # "optolith" | "dsa_ultimate" | "unknown"
    warnings: list[str]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_own_character(
    character_id: str,
    user: User,
    db: AsyncSession,
) -> Character:
    result = await db.execute(
        select(Character).where(
            Character.id == character_id,
            Character.user_id == user.id,
        )
    )
    char = result.scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")
    return char


def _detect_import_format(data: dict) -> str:
    """Auto-detect whether JSON is Optolith or DSA Ultimate format."""
    if "clientVersion" in data or "hero" in data:
        return "optolith"
    if "character" in data and "system" in data:
        return "dsa_ultimate"
    return "unknown"


def _parse_optolith(data: dict) -> dict:
    """Convert Optolith export to internal character data."""
    hero = data.get("hero", data)
    attrs_raw = hero.get("attr", {}).get("values", [])
    attributes = {}
    attr_map = {
        "ATTR_1": "MU", "ATTR_2": "KL", "ATTR_3": "IN", "ATTR_4": "CH",
        "ATTR_5": "FF", "ATTR_6": "GE", "ATTR_7": "KO", "ATTR_8": "KK",
    }
    for attr in attrs_raw:
        key = attr_map.get(attr.get("id", ""), attr.get("id", ""))
        attributes[key] = attr.get("value", 8)

    talents = {}
    for tid, fw in hero.get("talents", {}).items():
        talents[tid] = fw

    return {
        "name": hero.get("name", "Imported Character"),
        "species": hero.get("race", {}).get("name") if isinstance(hero.get("race"), dict) else hero.get("r"),
        "profession": hero.get("profession", {}).get("name") if isinstance(hero.get("profession"), dict) else hero.get("p"),
        "culture": hero.get("culture", {}).get("name") if isinstance(hero.get("culture"), dict) else hero.get("c"),
        "experience_grade": hero.get("el"),
        "total_ap": hero.get("ap", {}).get("total", 0) if isinstance(hero.get("ap"), dict) else 0,
        "available_ap": hero.get("ap", {}).get("available", 0) if isinstance(hero.get("ap"), dict) else 0,
        "attributes": attributes,
        "talents": talents,
        "spells": hero.get("spells", {}),
        "liturgies": hero.get("liturgies", {}),
        "special_abilities": hero.get("activatable", []),
        "advantages": hero.get("advantages", {}),
        "disadvantages": hero.get("disadvantages", {}),
    }


def _parse_dsa_ultimate(data: dict) -> dict:
    """Convert DSA Ultimate export to internal character data."""
    char = data.get("character", {})
    return {
        "name": char.get("name", "Imported Character"),
        "species": char.get("species"),
        "profession": char.get("profession"),
        "culture": char.get("culture"),
        "total_ap": char.get("total_ap", 0),
        "available_ap": char.get("available_ap", 0),
        "attributes": char.get("attributes", {}),
        "talents": char.get("talents", {}),
        "spells": char.get("spells", {}),
        "liturgies": char.get("liturgies", {}),
        "special_abilities": char.get("special_abilities", []),
        "advantages": char.get("advantages", {}),
        "disadvantages": char.get("disadvantages", {}),
    }


# Archetype templates for quick creation
ARCHETYPE_TEMPLATES: dict[str, dict] = {
    "Krieger": {
        "species": "Mensch",
        "profession": "Krieger",
        "attributes": {"MU": 14, "KL": 10, "IN": 11, "CH": 10, "FF": 11, "GE": 13, "KO": 14, "KK": 14},
        "combat_values": {"AT_basis": 9, "PA_basis": 5},
        "talents": {"Koerperbeherrschung": 4, "Kraftakt": 4, "Selbstbeherrschung": 4, "Einschuechtern": 3, "Willenskraft": 3},
    },
    "Magier": {
        "species": "Mensch",
        "profession": "Magier",
        "attributes": {"MU": 13, "KL": 15, "IN": 14, "CH": 12, "FF": 12, "GE": 10, "KO": 10, "KK": 8},
        "derived_values": {"AsP_max": 30},
        "talents": {"Magiekunde": 6, "Willenskraft": 4, "Sinnenschaerfe": 3},
        "spells": {"Fulminictus": 8, "Ignifaxius": 6, "Gardianum": 4, "Manifesto": 2},
    },
    "Geweihter": {
        "species": "Mensch",
        "profession": "Praios-Geweihter",
        "attributes": {"MU": 14, "KL": 13, "IN": 13, "CH": 14, "FF": 10, "GE": 10, "KO": 12, "KK": 11},
        "derived_values": {"KaP_max": 25},
        "talents": {"Goetterundkulte": 6, "Willenskraft": 4, "Menschenkenntnis": 4},
        "liturgies": {"Heilsegen": 6, "Lichtsegen": 4, "Schutzgebet": 3},
    },
    "Waldläufer": {
        "species": "Mensch",
        "profession": "Waldläufer",
        "attributes": {"MU": 12, "KL": 11, "IN": 14, "CH": 10, "FF": 13, "GE": 14, "KO": 13, "KK": 11},
        "talents": {"Faehrtensuchen": 6, "Tierkunde": 4, "Wildnisleben": 6, "Schleichen": 4, "Sinnesschaerfe": 4},
    },
    "Streuner": {
        "species": "Mensch",
        "profession": "Streuner",
        "attributes": {"MU": 11, "KL": 12, "IN": 13, "CH": 13, "FF": 14, "GE": 14, "KO": 10, "KK": 9},
        "talents": {"Gassenwissen": 6, "Schloesserknacken": 4, "Taschendiebstahl": 6, "Verbergen": 4, "Ueberreden": 4},
    },
}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[CharacterListResponse])
async def list_characters(
    unlocked_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List current user's characters."""
    query = (
        select(Character)
        .where(Character.user_id == current_user.id)
        .order_by(Character.created_at.desc())
    )
    if unlocked_only:
        query = query.where(Character.locked_session_id.is_(None))
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{character_id}", response_model=CharacterResponse)
async def get_character(
    character_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get full character detail (with enriched inventory)."""
    char = await _get_own_character(character_id, current_user, db)

    # Opportunistically filter expired buffs
    import time as _time
    if char.active_buffs:
        now_ms = int(_time.time() * 1000)
        active = [b for b in char.active_buffs if not b.get("expires_at") or b["expires_at"] > now_ms]
        if len(active) != len(char.active_buffs):
            char.active_buffs = active
            await db.commit()

    # Enrich basis_inventory before returning
    from utils.inventory_enrichment import enrich_basis_inventory
    if char.basis_inventory:
        enriched = await enrich_basis_inventory(char.basis_inventory, db)
        # Return enriched without mutating the DB model
        response = CharacterResponse.model_validate(char)
        response.basis_inventory = enriched
        return response
    return char


@router.post("", response_model=CharacterResponse, status_code=status.HTTP_201_CREATED)
async def create_character(
    body: CharacterCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new character from provided data."""
    char = Character(
        user_id=current_user.id,
        **body.model_dump(),
    )
    db.add(char)
    await db.commit()
    await db.refresh(char)
    return char


@router.post("/import", response_model=CharacterResponse, status_code=status.HTTP_201_CREATED)
async def import_character(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import character from JSON body or file upload (auto-detect Optolith vs DSA Ultimate)."""
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            data = await request.json()
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid JSON body",
            )
    elif "multipart/form-data" in content_type:
        form = await request.form()
        file = form.get("file")
        if file is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No file provided",
            )
        content = await file.read()
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid JSON file",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Expected JSON body or multipart file upload",
        )

    source_format = _detect_import_format(data)
    warnings: list[str] = []

    if source_format == "optolith":
        parsed = _parse_optolith(data)
    elif source_format == "dsa_ultimate":
        parsed = _parse_dsa_ultimate(data)
    else:
        warnings.append("Unknown format — imported raw data with best-effort mapping")
        parsed = {
            "name": data.get("name", "Imported Character"),
            "attributes": data.get("attributes", {}),
            "talents": data.get("talents", {}),
        }

    char = Character(
        user_id=current_user.id,
        name=parsed.get("name", "Imported Character"),
        species=parsed.get("species"),
        profession=parsed.get("profession"),
        culture=parsed.get("culture"),
        experience_grade=parsed.get("experience_grade"),
        total_ap=parsed.get("total_ap", 0),
        available_ap=parsed.get("available_ap", 0),
        attributes=parsed.get("attributes"),
        derived_values=parsed.get("derived_values"),
        combat_values=parsed.get("combat_values"),
        talents=parsed.get("talents"),
        spells=parsed.get("spells"),
        liturgies=parsed.get("liturgies"),
        special_abilities=parsed.get("special_abilities"),
        advantages=parsed.get("advantages"),
        disadvantages=parsed.get("disadvantages"),
    )
    db.add(char)
    await db.commit()
    await db.refresh(char)
    return char


@router.put("/{character_id}", response_model=CharacterResponse)
async def update_character(
    character_id: str,
    body: CharacterUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update character fields."""
    char = await _get_own_character(character_id, current_user, db)

    if char.locked_session_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Charakter ist in einer aktiven Sitzung und kann nicht bearbeitet werden",
        )

    update_data = body.model_dump(exclude_unset=True)

    if "status" in update_data:
        valid = ("created", "active", "resting", "retired", "dead")
        if update_data["status"] not in valid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"status must be one of {valid}",
            )

    for field, value in update_data.items():
        setattr(char, field, value)

    await db.commit()
    await db.refresh(char)
    return char


@router.post("/{character_id}/level-up", response_model=LevelUpResponse)
async def level_up(
    character_id: str,
    body: LevelUpRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Spend AP on upgrades. Validates costs and prerequisites via engine/leveling."""
    from engine import leveling

    char = await _get_own_character(character_id, current_user, db)

    if char.locked_session_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Charakter ist in einer aktiven Sitzung und kann nicht bearbeitet werden",
        )


    total_cost = 0
    applied: list[dict] = []
    warnings: list[str] = []

    char_data = {
        "attributes": dict(char.attributes or {}),
        "talents": dict(char.talents or {}),
        "spells": dict(char.spells or {}),
        "liturgies": dict(char.liturgies or {}),
        "special_abilities": list(char.special_abilities or []),
        "advantages": list(char.advantages) if isinstance(char.advantages, list) else dict(char.advantages or {}),
        "disadvantages": list(char.disadvantages) if isinstance(char.disadvantages, list) else dict(char.disadvantages or {}),
    }

    for upgrade in body.upgrades:
        upgrade_type = upgrade.get("type")
        upgrade_id = upgrade.get("id")

        if upgrade_type == "attribute":
            current_val = char_data["attributes"].get(upgrade_id, 8)
            cost = leveling.calculate_eigenschaft_cost(current_val)
            if cost is None:
                warnings.append(f"Cannot upgrade {upgrade_id} beyond maximum")
                continue
            char_data["attributes"][upgrade_id] = current_val + 1

        elif upgrade_type == "talent":
            current_val = char_data["talents"].get(upgrade_id, 0)
            factor = upgrade.get("steigerungsfaktor", "B")
            cost_info = leveling.calculate_upgrade_cost(current_val, factor)
            if cost_info is None:
                warnings.append(f"Cannot upgrade talent {upgrade_id} further")
                continue
            cost = cost_info
            char_data["talents"][upgrade_id] = current_val + 1

        elif upgrade_type == "spell":
            current_val = char_data["spells"].get(upgrade_id, 0)
            factor = upgrade.get("steigerungsfaktor", "C")
            cost_info = leveling.calculate_upgrade_cost(current_val, factor)
            if cost_info is None:
                warnings.append(f"Cannot upgrade spell {upgrade_id} further")
                continue
            cost = cost_info
            char_data["spells"][upgrade_id] = current_val + 1

        elif upgrade_type == "liturgy":
            current_val = char_data["liturgies"].get(upgrade_id, 0)
            factor = upgrade.get("steigerungsfaktor", "C")
            cost_info = leveling.calculate_upgrade_cost(current_val, factor)
            if cost_info is None:
                warnings.append(f"Cannot upgrade liturgy {upgrade_id} further")
                continue
            cost = cost_info
            char_data["liturgies"][upgrade_id] = current_val + 1

        elif upgrade_type == "combat_technique":
            ct_data = char.combat_techniques or {}
            current_val = ct_data.get(upgrade_id, 6)
            if isinstance(current_val, dict):
                current_val = current_val.get("ktw", current_val.get("value", 6))
            factor = upgrade.get("steigerungsfaktor", "C")
            cost = leveling.calculate_upgrade_cost(current_val, factor)
            if isinstance(ct_data.get(upgrade_id), dict):
                ct_data[upgrade_id] = {**ct_data[upgrade_id], "ktw": current_val + 1}
            else:
                ct_data[upgrade_id] = current_val + 1
            char.combat_techniques = ct_data

        elif upgrade_type == "learn_spell":
            if upgrade_id in char_data["spells"]:
                warnings.append(f"Spell {upgrade_id} already known — skipped")
                continue
            # Look up spell template from DB for authoritative improvement_cost
            from models.databank import SpellTemplate
            spell_result = await db.execute(
                select(SpellTemplate).where(SpellTemplate.id == upgrade_id)
            )
            spell_tmpl = spell_result.scalar_one_or_none()
            if not spell_tmpl:
                warnings.append(f"Unknown spell: {upgrade_id}")
                continue
            # Activation cost = SF table cost at FW 0 (DSA5 rule)
            factor = (spell_tmpl.improvement_cost or "C").upper()
            cost = leveling.calculate_upgrade_cost(0, factor)
            char_data["spells"][upgrade_id] = 0

        elif upgrade_type == "learn_liturgy":
            if upgrade_id in char_data["liturgies"]:
                warnings.append(f"Liturgy {upgrade_id} already known — skipped")
                continue
            from models.databank import LiturgyTemplate
            liturgy_result = await db.execute(
                select(LiturgyTemplate).where(LiturgyTemplate.id == upgrade_id)
            )
            liturgy_tmpl = liturgy_result.scalar_one_or_none()
            if not liturgy_tmpl:
                warnings.append(f"Unknown liturgy: {upgrade_id}")
                continue
            factor = (liturgy_tmpl.improvement_cost or "C").upper()
            cost = leveling.calculate_upgrade_cost(0, factor)
            char_data["liturgies"][upgrade_id] = 0

        elif upgrade_type == "learn_spell_enhancement":
            # Learn a spell enhancement (Zaubererweiterung)
            # upgrade format: {type, spell_id, enhancement_level, ap_cost (optional fallback)}
            spell_id = upgrade.get("spell_id", upgrade_id)
            enh_level = upgrade.get("enhancement_level", 1)
            from models.databank import SpellTemplate
            spell_result = await db.execute(
                select(SpellTemplate).where(SpellTemplate.id == spell_id)
            )
            spell_tmpl = spell_result.scalar_one_or_none()
            if spell_tmpl and spell_tmpl.enhancements:
                # Find the enhancement by level
                enh = next((e for e in spell_tmpl.enhancements if e.get("level") == enh_level), None)
                if enh and "cost" in enh:
                    cost = enh["cost"]
                else:
                    cost = upgrade.get("ap_cost", 0)
                    warnings.append(f"Enhancement level {enh_level} cost not found for spell '{spell_id}' — using provided cost")
            else:
                cost = upgrade.get("ap_cost", 0)
                warnings.append(f"Spell '{spell_id}' enhancements not found — using provided cost")
            # Store learned enhancement
            learned_enhancements = char_data.setdefault("spell_enhancements", {})
            spell_enh_list = learned_enhancements.setdefault(spell_id, [])
            if enh_level not in spell_enh_list:
                spell_enh_list.append(enh_level)

        elif upgrade_type == "learn_liturgy_enhancement":
            # Learn a liturgy enhancement (Liturgieerweiterung)
            liturgy_id = upgrade.get("liturgy_id", upgrade_id)
            enh_level = upgrade.get("enhancement_level", 1)
            from models.databank import LiturgyTemplate
            lit_result = await db.execute(
                select(LiturgyTemplate).where(LiturgyTemplate.id == liturgy_id)
            )
            lit_tmpl = lit_result.scalar_one_or_none()
            if lit_tmpl and lit_tmpl.enhancements:
                enh = next((e for e in lit_tmpl.enhancements if e.get("level") == enh_level), None)
                if enh and "cost" in enh:
                    cost = enh["cost"]
                else:
                    cost = upgrade.get("ap_cost", 0)
                    warnings.append(f"Enhancement level {enh_level} cost not found for liturgy '{liturgy_id}' — using provided cost")
            else:
                cost = upgrade.get("ap_cost", 0)
                warnings.append(f"Liturgy '{liturgy_id}' enhancements not found — using provided cost")
            learned_enhancements = char_data.setdefault("liturgy_enhancements", {})
            lit_enh_list = learned_enhancements.setdefault(liturgy_id, [])
            if enh_level not in lit_enh_list:
                lit_enh_list.append(enh_level)

        elif upgrade_type == "special_ability":
            # Look up SA template from DB for authoritative ap_cost
            from models.databank import SpecialAbilityTemplate
            sa_result = await db.execute(
                select(SpecialAbilityTemplate).where(SpecialAbilityTemplate.id == upgrade_id)
            )
            sa_tmpl = sa_result.scalar_one_or_none()
            if sa_tmpl and sa_tmpl.ap_cost is not None:
                cost = sa_tmpl.ap_cost
            else:
                # Fallback: trust frontend value only if template not in DB (custom SA)
                cost = upgrade.get("ap_cost", 0)
                if not sa_tmpl:
                    warnings.append(f"SA '{upgrade_id}' not found in DB — using provided AP cost")
            char_data["special_abilities"].append(upgrade_id)

        else:
            warnings.append(f"Unknown upgrade type: {upgrade_type}")
            continue

        total_cost += cost
        applied.append({"type": upgrade_type, "id": upgrade_id, "cost": cost})

    if total_cost > char.available_ap:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Not enough AP: need {total_cost}, have {char.available_ap}",
        )

    # Apply changes
    char.available_ap -= total_cost
    char.attributes = char_data["attributes"]
    char.talents = char_data["talents"]
    char.spells = char_data["spells"]
    char.liturgies = char_data["liturgies"]
    char.special_abilities = char_data["special_abilities"]
    char.derived_values = _recompute_derived(
        char_data["attributes"],
        char_data["spells"],
        char_data["liturgies"],
        char.derived_values,
    )

    await db.commit()
    await db.refresh(char)

    return LevelUpResponse(
        character_id=char.id,
        ap_spent=total_cost,
        remaining_ap=char.available_ap,
        upgrades_applied=applied,
        warnings=warnings,
    )


class VitalsUpdateRequest(BaseModel):
    lep: Optional[int] = None
    asp: Optional[int] = None
    kap: Optional[int] = None
    schip: Optional[int] = None


class ConditionsUpdateRequest(BaseModel):
    conditions: list[dict]


@router.patch("/{character_id}/vitals", response_model=dict)
async def update_vitals(
    character_id: str,
    body: VitalsUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a character's current vitals (LeP, AsP, KaP, SchiP).

    Can be called by the character owner or by the GM of their campaign.
    """
    result = await db.execute(select(Character).where(Character.id == character_id))
    char = result.scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")

    if char.locked_session_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Charakter ist in einer aktiven Sitzung — Werte nur über die Sitzung änderbar",
        )

    # Allow owner or GM
    if char.user_id != current_user.id:
        from models.campaign import Campaign, CampaignPlayer
        player_result = await db.execute(
            select(CampaignPlayer).where(CampaignPlayer.character_id == character_id)
        )
        is_gm = False
        for cp in player_result.scalars().all():
            campaign_result = await db.execute(select(Campaign).where(Campaign.id == cp.campaign_id))
            campaign = campaign_result.scalar_one_or_none()
            if campaign and campaign.gm_user_id == current_user.id:
                is_gm = True
                break
        if not is_gm:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access")

    current_vitals = dict(char.current_vitals or {})
    dv = char.derived_values or {}
    update_data = body.model_dump(exclude_unset=True)
    # Clamp vitals to valid bounds
    max_vals = {"lep": dv.get("LeP_max", 999), "asp": dv.get("AsP_max", 999), "kap": dv.get("KaP_max", 999), "schip": dv.get("Schip", 10)}
    for key, value in update_data.items():
        if value is not None:
            cap = max_vals.get(key, 999)
            current_vitals[key] = max(0, min(value, cap))
    char.current_vitals = current_vitals
    await db.commit()

    # Invalidate WS in-memory cache so next delta resolution reads fresh values
    try:
        from ws.handlers import _session_state
        for state in _session_state.values():
            if character_id in state.get("vitals", {}):
                state["vitals"][character_id] = dict(current_vitals)
    except Exception:
        pass  # WS module may not be loaded in test contexts

    return {"character_id": character_id, "vitals": current_vitals}


@router.patch("/{character_id}/conditions", response_model=dict)
async def update_conditions(
    character_id: str,
    body: ConditionsUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a character's active conditions."""
    result = await db.execute(select(Character).where(Character.id == character_id))
    char = result.scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")

    if char.user_id != current_user.id:
        from models.campaign import Campaign, CampaignPlayer
        player_result = await db.execute(
            select(CampaignPlayer).where(CampaignPlayer.character_id == character_id)
        )
        is_gm = False
        for cp in player_result.scalars().all():
            campaign_result = await db.execute(select(Campaign).where(Campaign.id == cp.campaign_id))
            campaign = campaign_result.scalar_one_or_none()
            if campaign and campaign.gm_user_id == current_user.id:
                is_gm = True
                break
        if not is_gm:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access")

    char.conditions = body.conditions
    await db.commit()
    return {"character_id": character_id, "conditions": char.conditions}


@router.delete("/{character_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_character(
    character_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete a character."""
    char = await _get_own_character(character_id, current_user, db)

    if char.locked_session_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Charakter ist in einer aktiven Sitzung und kann nicht gelöscht werden",
        )

    await db.delete(char)
    await db.commit()


@router.post("/quick-template", response_model=CharacterResponse, status_code=status.HTTP_201_CREATED)
async def quick_template(
    body: QuickTemplateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a character from an archetype template (Krieger, Magier, etc.)."""
    template = ARCHETYPE_TEMPLATES.get(body.archetype)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown archetype: {body.archetype}. Available: {list(ARCHETYPE_TEMPLATES.keys())}",
        )

    # Determine AP by experience grade
    ap_table = {
        "unerfahren": 900, "durchschnittlich": 1000, "erfahren": 1100,
        "kompetent": 1200, "meisterlich": 1400, "brillant": 1700,
        "legendaer": 2100,
    }
    total_ap = ap_table.get(body.experience_grade or "erfahren", 1100)

    char = Character(
        user_id=current_user.id,
        name=body.name,
        species=template.get("species"),
        profession=template.get("profession"),
        culture=template.get("culture"),
        experience_grade=body.experience_grade or "erfahren",
        total_ap=total_ap,
        available_ap=0,
        creation_finalized=True,
        attributes=template.get("attributes"),
        derived_values=template.get("derived_values"),
        combat_values=template.get("combat_values"),
        talents=template.get("talents"),
        spells=template.get("spells"),
        liturgies=template.get("liturgies"),
        special_abilities=template.get("special_abilities"),
    )
    db.add(char)
    await db.commit()
    await db.refresh(char)
    return char


@router.get("/{character_id}/export")
async def export_character(
    character_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export character as JSON (with enriched inventory)."""
    char = await _get_own_character(character_id, current_user, db)

    from utils.inventory_enrichment import enrich_basis_inventory
    enriched_inv = await enrich_basis_inventory(char.basis_inventory, db)

    return {
        "format": "aventuria_vtt",
        "version": 1,
        "character": {
            "name": char.name,
            "species": char.species,
            "profession": char.profession,
            "culture": char.culture,
            "experience_grade": char.experience_grade,
            "total_ap": char.total_ap,
            "available_ap": char.available_ap,
            "status": char.status,
            "bio": char.bio,
            "attributes": char.attributes,
            "derived_values": char.derived_values,
            "combat_values": char.combat_values,
            "talents": char.talents,
            "spells": char.spells,
            "liturgies": char.liturgies,
            "special_abilities": char.special_abilities,
            "advantages": char.advantages,
            "disadvantages": char.disadvantages,
            "basis_inventory": enriched_inv,
        },
    }

"""Idempotent database seeder. Reads JSON files from databank-seed/ and upserts into the database.
Also creates test accounts for development.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple, Type
from uuid import uuid4

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

# ---------------------------------------------------------------------------
# Resolve project root and add backend to path for model imports
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent  # backend/databank/
BACKEND_DIR = SCRIPT_DIR.parent               # backend/
PROJECT_ROOT = BACKEND_DIR.parent              # project root
SEED_DIR = PROJECT_ROOT / "databank-seed"

sys.path.insert(0, str(BACKEND_DIR))

from config import get_settings  # noqa: E402
from database import Base  # noqa: E402
from models.databank import (  # noqa: E402
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
    AdvantageTemplate,
    DisadvantageTemplate,
    CantripTemplate,
    BlessingTemplate,
)
from models.wiki import WikiPage  # noqa: E402
from models.user import User  # noqa: E402
from models.character import Character  # noqa: E402
from models.campaign import Campaign, CampaignPlayer, Group, GroupMember  # noqa: E402

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("databank.seed")

# ---------------------------------------------------------------------------
# Mapping: JSON filename  ->  (SQLAlchemy model, list of JSON column names)
# ---------------------------------------------------------------------------
SEED_MAP: Dict[str, Tuple[type, List[str]]] = {
    "creatures.json": (
        CreatureTemplate,
        ["attributes", "combat_values", "attacks", "special_rules",
         "immunities", "vulnerabilities", "habitat", "guaranteed_loot"],
    ),
    "weapons.json": (
        WeaponTemplate,
        ["properties", "range_brackets"],
    ),
    "armor.json": (
        ArmorTemplate,
        ["zones", "properties"],
    ),
    "shields.json": (
        ShieldTemplate,
        [],
    ),
    "items.json": (
        ItemTemplate,
        ["effects"],
    ),
    "herbs_potions.json": (
        ItemTemplate,
        ["effects"],
    ),
    "poisons_diseases.json": (
        ItemTemplate,
        ["effects"],
    ),
    "spells.json": (
        SpellTemplate,
        ["tradition", "probe", "effect_per_qs", "condition_inflicted", "buff_effect", "enhancements"],
    ),
    "liturgies.json": (
        LiturgyTemplate,
        ["tradition", "probe", "effect_per_qs", "condition_inflicted", "buff_effect", "enhancements"],
    ),
    "cantrips.json": (
        CantripTemplate,
        ["tradition"],
    ),
    "blessings.json": (
        BlessingTemplate,
        ["tradition"],
    ),
    "special_abilities.json": (
        SpecialAbilityTemplate,
        ["prerequisites", "combinable_with", "exclusive_with", "applicable_techniques"],
    ),
    "talents.json": (
        TalentTemplate,
        ["probe", "applications"],
    ),
    "rules_reference.json": (
        RulesSnippet,
        ["keywords", "table_data"],
    ),
    "species.json": (
        SpeciesTemplate,
        ["base_attributes", "attribute_adjustments", "common_cultures", "auto_advantages", "special_rules", "variants"],
    ),
    "cultures.json": (
        CultureTemplate,
        ["compatible_species", "skill_bonuses", "languages", "scripts"],
    ),
    "professions.json": (
        ProfessionTemplate,
        ["compatible_species", "combat_techniques", "skills", "special_abilities", "spells", "liturgies", "starting_equipment", "starting_money", "variants"],
    ),
    "advantages.json": (
        AdvantageTemplate,
        ["prerequisites"],
    ),
    "disadvantages.json": (
        DisadvantageTemplate,
        ["prerequisites"],
    ),
}


def _load_json(filepath: Path) -> List[dict]:
    """Load and parse a JSON seed file."""
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"{filepath.name} must be a JSON array, got {type(data).__name__}")
    return data


# ---------------------------------------------------------------------------
# Seed record validation
# ---------------------------------------------------------------------------
REQUIRED_FIELDS: Dict[str, List[str]] = {
    "weapons": ["id", "name", "combat_technique", "damage"],
    "armor": ["id", "name", "rs", "be"],
    "shields": ["id", "name", "pa_mod"],
    "items": ["id", "name", "category"],
    "spells": ["id", "name", "probe", "asp_cost"],
    "liturgies": ["id", "name", "probe", "kap_cost"],
    "talents": ["id", "name", "category", "probe"],
    "special_abilities": ["id", "name", "category", "ap_cost"],
    "creatures": ["id", "name", "attributes", "combat_values", "attacks"],
    "species": ["id", "name", "lep_base"],
    "cultures": ["id", "name"],
    "professions": ["id", "name"],
    "advantages": ["id", "name", "ap_cost"],
    "disadvantages": ["id", "name", "ap_cost"],
    "cantrips": ["id", "name"],
    "blessings": ["id", "name"],
}

# Map JSON filenames to validation entity types
_FILE_TO_ENTITY: Dict[str, str] = {
    "weapons.json": "weapons",
    "armor.json": "armor",
    "shields.json": "shields",
    "items.json": "items",
    "herbs_potions.json": "items",
    "poisons_diseases.json": "items",
    "spells.json": "spells",
    "liturgies.json": "liturgies",
    "talents.json": "talents",
    "special_abilities.json": "special_abilities",
    "creatures.json": "creatures",
    "species.json": "species",
    "cultures.json": "cultures",
    "professions.json": "professions",
    "advantages.json": "advantages",
    "disadvantages.json": "disadvantages",
    "cantrips.json": "cantrips",
    "blessings.json": "blessings",
}


def _validate_record(entity_type: str, record: dict) -> List[str]:
    """Validate a single seed record. Returns list of warning messages."""
    warnings = []
    required = REQUIRED_FIELDS.get(entity_type, [])
    record_id = record.get("id", "<unknown>")
    for field in required:
        val = record.get(field)
        if val is None or val == "":
            warnings.append(f"[{entity_type}] {record_id}: missing required field '{field}'")
    return warnings


def _validate_cross_references(session: Session, all_records: Dict[str, List[dict]]) -> List[str]:
    """Cross-reference validation after all upserts. Returns list of warnings."""
    warnings = []

    # Collect all known combat technique names from the DB
    technique_names: Set[str] = set()
    for t in session.query(CombatTechniqueTemplate).all():
        technique_names.add(t.name)

    # Check weapon combat_technique references
    for rec in all_records.get("weapons.json", []):
        ct = rec.get("combat_technique")
        if ct and ct not in technique_names:
            warnings.append(
                f"[xref] weapon '{rec.get('id')}': combat_technique '{ct}' not found in CombatTechniqueTemplate"
            )

    # Check SA applicable_techniques references
    for rec in all_records.get("special_abilities.json", []):
        for tech in (rec.get("applicable_techniques") or []):
            if tech not in technique_names:
                warnings.append(
                    f"[xref] SA '{rec.get('id')}': applicable_technique '{tech}' not found in CombatTechniqueTemplate"
                )

    return warnings


def _model_columns(model: type) -> Set[str]:
    """Return the set of column names for a SQLAlchemy model."""
    mapper = inspect(model)
    return {col.key for col in mapper.column_attrs}


def _upsert_batch(session: Session, model: type, records: List[dict], entity_type: Optional[str] = None) -> int:
    """Insert-or-update records. Works with SQLite (merge-based).
    If entity_type is given, validates each record and logs warnings.
    """
    if not records:
        return 0

    valid_cols = _model_columns(model)
    count = 0
    for rec in records:
        # Validate before upsert
        if entity_type:
            for w in _validate_record(entity_type, rec):
                log.warning("  VALIDATION: %s", w)

        row = {k: v for k, v in rec.items() if k in valid_cols}
        record_id = row.get("id")
        if record_id is None:
            continue

        existing = session.get(model, record_id)
        if existing:
            for k, v in row.items():
                if k != "id":
                    setattr(existing, k, v)
        else:
            session.add(model(**row))
        count += 1

    return count


def _seed_profession_equipment(session: Session) -> int:
    """Load profession_equipment.json and set starting_equipment/starting_money on ProfessionTemplate rows."""
    filepath = SEED_DIR / "profession_equipment.json"
    if not filepath.exists():
        log.warning("profession_equipment.json not found, skipping")
        return 0

    records = _load_json(filepath)
    count = 0
    for rec in records:
        prof_id = rec.get("profession_id")
        if not prof_id:
            continue

        prof = session.get(ProfessionTemplate, prof_id)
        if not prof:
            log.warning("  profession '%s' not found, skipping equipment", prof_id)
            continue

        prof.starting_equipment = rec.get("items", [])
        prof.starting_money = rec.get("money", {})
        count += 1

    log.info("  Updated starting equipment for %d professions", count)
    return count


def _seed_wiki_pages(session: Session) -> int:
    """Seed wiki pages from wiki_pages.json, upserting by slug."""
    filepath = SEED_DIR / "wiki_pages.json"
    if not filepath.exists():
        log.warning("wiki_pages.json not found, skipping wiki seed")
        return 0

    records = _load_json(filepath)
    valid_cols = _model_columns(WikiPage)
    count = 0
    for rec in records:
        slug = rec.get("slug")
        if not slug:
            continue

        row_data = {k: v for k, v in rec.items() if k in valid_cols}

        existing = session.query(WikiPage).filter_by(slug=slug).first()
        if existing:
            for k, v in row_data.items():
                if k not in ("id", "slug"):
                    setattr(existing, k, v)
        else:
            if "id" not in row_data:
                row_data["id"] = str(uuid4())
            session.add(WikiPage(**row_data))
        count += 1

    log.info("  Upserted %d wiki pages", count)
    return count


def _seed_combat_techniques(session: Session):
    """Seed all 21 DSA5 Kampftechniken from the official Regel-Wiki."""
    techniques = [
        # Nahkampf (Melee)
        {"id": "kt_dolche", "name": "Dolche", "category": "nahkampf", "primary_attribute": ["GE"], "improvement_cost": "B", "can_parry": True, "parry_restrictions": "Kann nicht gegen Kettenwaffen, Stangenwaffen, Zweihandhiebwaffen und Zweihandschwerter parieren"},
        {"id": "kt_faecher", "name": "Fächer", "category": "nahkampf", "primary_attribute": ["GE"], "improvement_cost": "C", "can_parry": True},
        {"id": "kt_fechtwaffen", "name": "Fechtwaffen", "category": "nahkampf", "primary_attribute": ["GE"], "improvement_cost": "C", "can_parry": True, "parry_restrictions": "Kann nicht gegen Kettenwaffen, Stangenwaffen, Zweihandhiebwaffen und Zweihandschwerter parieren", "special_rules": "Verteidigungsproben gegen Fechtwaffen erhalten -1"},
        {"id": "kt_hiebwaffen", "name": "Hiebwaffen", "category": "nahkampf", "primary_attribute": ["KK"], "improvement_cost": "C", "can_parry": True},
        {"id": "kt_kettenwaffen", "name": "Kettenwaffen", "category": "nahkampf", "primary_attribute": ["KK"], "improvement_cost": "C", "can_parry": False, "parry_restrictions": "Keine Parade moeglich"},
        {"id": "kt_lanzen", "name": "Lanzen", "category": "nahkampf", "primary_attribute": ["KK"], "improvement_cost": "B", "can_parry": False, "special_rules": "Nur vom Reittier aus einsetzbar"},
        {"id": "kt_peitschen", "name": "Peitschen", "category": "nahkampf", "primary_attribute": ["GE", "KK"], "improvement_cost": "B", "can_parry": False},
        {"id": "kt_raufen", "name": "Raufen", "category": "nahkampf", "primary_attribute": ["GE", "KK"], "improvement_cost": "B", "can_parry": True},
        {"id": "kt_schilde", "name": "Schilde", "category": "nahkampf", "primary_attribute": ["KK"], "improvement_cost": "C", "can_parry": True, "special_rules": "Schilde als Waffen nutzen"},
        {"id": "kt_schwerter", "name": "Schwerter", "category": "nahkampf", "primary_attribute": ["GE", "KK"], "improvement_cost": "C", "can_parry": True},
        {"id": "kt_spiesswaffen", "name": "Spießwaffen", "category": "nahkampf", "primary_attribute": ["KK", "GE"], "improvement_cost": "B", "can_parry": True},
        {"id": "kt_stangenwaffen", "name": "Stangenwaffen", "category": "nahkampf", "primary_attribute": ["GE", "KK"], "improvement_cost": "C", "can_parry": True},
        {"id": "kt_zweihandhiebwaffen", "name": "Zweihandhiebwaffen", "category": "nahkampf", "primary_attribute": ["KK"], "improvement_cost": "C", "can_parry": True},
        {"id": "kt_zweihandschwerter", "name": "Zweihandschwerter", "category": "nahkampf", "primary_attribute": ["KK"], "improvement_cost": "C", "can_parry": True},
        # Fernkampf (Ranged)
        {"id": "kt_armbrueste", "name": "Armbrüste", "category": "fernkampf", "primary_attribute": ["FF"], "improvement_cost": "B", "can_parry": False},
        {"id": "kt_blasrohre", "name": "Blasrohre", "category": "fernkampf", "primary_attribute": ["FF"], "improvement_cost": "B", "can_parry": False},
        {"id": "kt_boegen", "name": "Bögen", "category": "fernkampf", "primary_attribute": ["FF"], "improvement_cost": "C", "can_parry": False},
        {"id": "kt_diskusse", "name": "Diskusse", "category": "fernkampf", "primary_attribute": ["FF"], "improvement_cost": "B", "can_parry": False},
        {"id": "kt_schleudern", "name": "Schleudern", "category": "fernkampf", "primary_attribute": ["FF"], "improvement_cost": "B", "can_parry": False},
        {"id": "kt_wurfwaffen", "name": "Wurfwaffen", "category": "fernkampf", "primary_attribute": ["FF"], "improvement_cost": "B", "can_parry": False},
        {"id": "kt_feuerspeien", "name": "Feuerspeien", "category": "fernkampf", "primary_attribute": ["FF"], "improvement_cost": "B", "can_parry": False},
    ]
    for tech_data in techniques:
        existing = session.query(CombatTechniqueTemplate).filter_by(id=tech_data["id"]).first()
        if existing:
            for k, v in tech_data.items():
                if k != "id":
                    setattr(existing, k, v)
        else:
            tech = CombatTechniqueTemplate(**tech_data)
            session.add(tech)
    log.info("  Seeded %d combat techniques", len(techniques))


def _create_test_accounts(session: Session) -> Dict[str, str]:
    """Create test accounts for development. Returns dict of email -> user_id."""
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    accounts = [
        {
            "username": "Spielleiter",
            "email": "gm@test.de",
            "password": "test1234",
            "preferred_complexity": "standard",
        },
        {
            "username": "Balgra",
            "email": "player1@test.de",
            "password": "test1234",
            "preferred_complexity": "basic",
        },
        {
            "username": "Elara",
            "email": "player2@test.de",
            "password": "test1234",
            "preferred_complexity": "standard",
        },
        {
            "username": "Thorben",
            "email": "player3@test.de",
            "password": "test1234",
            "preferred_complexity": "basic",
        },
        {
            "username": "Yara",
            "email": "player4@test.de",
            "password": "test1234",
            "preferred_complexity": "standard",
        },
    ]

    user_ids = {}
    for acc in accounts:
        existing = session.query(User).filter_by(email=acc["email"]).first()
        if existing:
            log.info("  Account already exists: %s", acc["email"])
            user_ids[acc["email"]] = str(existing.id)
            continue

        user_id = str(uuid4())
        user = User(
            id=user_id,
            username=acc["username"],
            email=acc["email"],
            password_hash=pwd_context.hash(acc["password"]),
            preferred_complexity=acc["preferred_complexity"],
        )
        session.add(user)
        user_ids[acc["email"]] = user_id
        log.info("  Created account: %s (%s) — password: %s", acc["username"], acc["email"], acc["password"])

    return user_ids


def _create_test_characters(session: Session, user_ids: Dict[str, str]):
    """Create pre-built test characters for the test accounts."""
    characters = [
        {
            "user_id": user_ids.get("player1@test.de"),
            "name": "Balgra Felszorn",
            "species": "Zwerg",
            "profession": "Krieger",
            "culture": "Ambosszwerge",
            "experience_grade": "Erfahren",
            "total_ap": 1100,
            "available_ap": 75,
            "status": "created",
            "bio": "Balgra verließ die Hallen von Xorlosch nach dem Mord an seinem Vater. Er sucht Gerechtigkeit — oder Rache.",
            "attributes": {"MU": 14, "KL": 11, "IN": 12, "CH": 10, "FF": 10, "GE": 13, "KO": 15, "KK": 15},
            "derived_values": {"LeP_max": 34, "AsP_max": 0, "KaP_max": 0, "INI_basis": 11, "GS": 7, "AW": 5, "SK": 1, "ZK": 3, "Schip": 3},
            "combat_values": {"weapons": [{"name": "Streitaxt", "technique": "Hiebwaffen", "AT": 14, "PA": 8, "TP": "1W6+5", "reach": "mittel"}], "RS": 4, "BE": 3},
            "combat_techniques": {"Hiebwaffen": 14, "Raufen": 8, "Dolche": 8, "Schwerter": 10},
            "talents": {"klettern": 8, "koerperbeherrschung": 10, "kraftakt": 12, "selbstbeherrschung": 6, "sinnesschaerfe": 6, "zechen": 10, "einschuechtern": 8, "mechanik": 6, "steinbearbeitung": 8},
            "spells": {},
            "liturgies": {},
            "special_abilities": ["Wuchtschlag I", "Schildkampf I", "Rüstungsgewöhnung I"],
            "advantages": ["Zäher Hund", "Hohe Zähigkeit"],
            "disadvantages": ["Jähzorn", "Goldgier"],
            "basis_inventory": [
                {"name": "Streitaxt", "template_id": "streitaxt", "quantity": 1, "weight": 1.5, "equipped": True},
                {"name": "Buckler", "template_id": "faustschild", "quantity": 1, "weight": 0.5, "equipped": True},
                {"name": "Kettenhemd", "template_id": "kettenhemd", "quantity": 1, "weight": 8.0, "equipped": True},
                {"name": "Proviant (7 Tage)", "template_id": "proviant_tag", "quantity": 7, "weight": 2.0},
                {"name": "Schlafsack", "template_id": "schlafsack", "quantity": 1, "weight": 1.0},
                {"name": "Seil (10 Schritt)", "template_id": "seil", "quantity": 1, "weight": 1.0},
                {"name": "Silbertaler", "template_id": "silbermuenze", "quantity": 47, "weight": 0.3},
                {"name": "Elixier der Stärke", "template_id": "elixier_der_staerke", "quantity": 3, "weight": 0.2},
            ],
        },
        {
            "user_id": user_ids.get("player2@test.de"),
            "name": "Elara Sternenfunke",
            "species": "Elf",
            "profession": "Magierin (Gildenmagierin)",
            "culture": "Auelfen",
            "experience_grade": "Erfahren",
            "total_ap": 1100,
            "available_ap": 50,
            "status": "created",
            "bio": "Elara studierte an der Akademie zu Punin und bereist nun Aventurien, um altes Wissen zu sammeln.",
            "attributes": {"MU": 14, "KL": 15, "IN": 14, "CH": 13, "FF": 12, "GE": 13, "KO": 10, "KK": 9},
            "derived_values": {"LeP_max": 24, "AsP_max": 32, "KaP_max": 0, "INI_basis": 10, "GS": 8, "AW": 6, "SK": 3, "ZK": 1, "Schip": 3},
            "combat_values": {"weapons": [{"name": "Magierstab", "technique": "Stangenwaffen", "AT": 10, "PA": 8, "TP": "1W6+2", "reach": "lang"}], "RS": 1, "BE": 0},
            "combat_techniques": {"Stangenwaffen": 10, "Dolche": 6, "Raufen": 6},
            "talents": {"sinnesschaerfe": 8, "koerperbeherrschung": 6, "magiekunde": 12, "sagen_legenden": 8, "goetter_kulte": 6, "rechnen": 7, "ueberreden": 6, "menschenkenntnis": 8},
            "spells": {"ignifaxius": 12, "fulminictus": 10, "balsam_salabunde": 11, "gardianum": 9, "odem_arcanum": 8, "flim_flam": 10, "horriphobus": 7, "paralysis": 8},
            "liturgies": {},
            "special_abilities": ["Zauber verbreiten", "Tradition (Gildenmagie)"],
            "advantages": ["Gutaussehend", "Zauberer"],
            "disadvantages": ["Neugier", "Körperliche Auffälligkeit (spitze Ohren)"],
            "basis_inventory": [
                {"name": "Magierstab (Geweiht)", "template_id": "kampfstab", "quantity": 1, "weight": 1.5, "equipped": True},
                {"name": "Elfische Reiserobe", "template_id": "tuchruestung", "quantity": 1, "weight": 0.5, "equipped": True},
                {"name": "Schreibzeug", "template_id": "schreibzeug", "quantity": 1, "weight": 0.3},
                {"name": "Heiltrank (schwach)", "template_id": "heiltrank_klein", "quantity": 2, "weight": 0.1},
                {"name": "Alraune (getrocknet)", "template_id": "alraune", "quantity": 1, "weight": 0.1},
                {"name": "Silbertaler", "template_id": "silbermuenze", "quantity": 35, "weight": 0.2},
            ],
        },
        {
            "user_id": user_ids.get("player3@test.de"),
            "name": "Thorben Praiosmund",
            "species": "Mensch",
            "profession": "Geweihter der Peraine",
            "culture": "Mittelreich",
            "experience_grade": "Erfahren",
            "total_ap": 1100,
            "available_ap": 60,
            "status": "created",
            "bio": "Thorben dient der Göttin Peraine und wandert durch das Land, um Kranke zu heilen und den Schwachen beizustehen.",
            "attributes": {"MU": 12, "KL": 14, "IN": 13, "CH": 14, "FF": 11, "GE": 11, "KO": 13, "KK": 11},
            "derived_values": {"LeP_max": 28, "AsP_max": 0, "KaP_max": 28, "INI_basis": 9, "GS": 8, "AW": 5, "SK": 2, "ZK": 2, "Schip": 3},
            "combat_values": {"weapons": [{"name": "Streitkolben", "technique": "Hiebwaffen", "AT": 12, "PA": 8, "TP": "1W6+4", "reach": "mittel"}], "RS": 3, "BE": 2},
            "combat_techniques": {"Hiebwaffen": 12, "Schilde": 8, "Raufen": 6},
            "talents": {"heilkunde_wunden": 10, "heilkunde_krankheiten": 8, "heilkunde_gift": 6, "pflanzenkunde": 8, "goetter_kulte": 10, "ueberreden": 6, "willenskraft": 8, "menschenkenntnis": 6},
            "spells": {},
            "liturgies": {"heilsegen": 10, "sternenglanz": 8, "blendstrahl": 6, "friedvolle_aura": 7},
            "special_abilities": ["Tradition (Perainekirche)", "Liturgiestil (Peraine)"],
            "advantages": ["Geweihter", "Hohe Karmalkraft I"],
            "disadvantages": ["Prinzipientreue", "Mitleid"],
            "basis_inventory": [
                {"name": "Streitkolben", "template_id": "streitkolben", "quantity": 1, "weight": 1.0, "equipped": True},
                {"name": "Lederharnisch", "template_id": "lederruestung", "quantity": 1, "weight": 5.0, "equipped": True},
                {"name": "Peraine-Heilbeutel", "template_id": "verbandszeug", "quantity": 1, "weight": 0.5},
                {"name": "Heilkräuter (verschiedene)", "template_id": "heilkraeuterpaeckchen", "quantity": 5, "weight": 0.2},
                {"name": "Silbertaler", "template_id": "silbermuenze", "quantity": 20, "weight": 0.1},
            ],
        },
        {
            "user_id": user_ids.get("player4@test.de"),
            "name": "Yara Falkenauge",
            "species": "Halbelf",
            "profession": "Jägerin",
            "culture": "Nivesen",
            "experience_grade": "Erfahren",
            "total_ap": 1100,
            "available_ap": 45,
            "status": "created",
            "bio": "Yara wuchs in den Wäldern der Nivesen auf. Sie führt jeden sicher durch die Wildnis — solange man ihr nicht in die Quere kommt.",
            "attributes": {"MU": 13, "KL": 12, "IN": 14, "CH": 11, "FF": 14, "GE": 14, "KO": 12, "KK": 10},
            "derived_values": {"LeP_max": 26, "AsP_max": 0, "KaP_max": 0, "INI_basis": 11, "GS": 8, "AW": 7, "SK": 1, "ZK": 1, "Schip": 3},
            "combat_values": {"weapons": [
                {"name": "Langbogen", "technique": "Bögen", "AT": 14, "TP": "1W6+4", "reach": "weit", "ranged": True},
                {"name": "Jagdmesser", "technique": "Dolche", "AT": 12, "PA": 6, "TP": "1W6+1", "reach": "kurz"}
            ], "RS": 1, "BE": 0},
            "combat_techniques": {"Bögen": 14, "Dolche": 12, "Wurfwaffen": 8, "Raufen": 6},
            "talents": {"faehrtensuchen": 12, "verbergen": 10, "sinnesschaerfe": 10, "wildnisleben": 10, "tierkunde": 8, "pflanzenkunde": 6, "orientierung": 8, "koerperbeherrschung": 8, "klettern": 6},
            "spells": {},
            "liturgies": {},
            "special_abilities": ["Scharfschütze", "Schnellladen (Bogen)"],
            "advantages": ["Fuchssinn", "Dunkelsicht"],
            "disadvantages": ["Neugier", "Platzangst"],
            "basis_inventory": [
                {"name": "Langbogen", "template_id": "langbogen", "quantity": 1, "weight": 0.5, "equipped": True},
                {"name": "Jagdmesser", "template_id": "dolch", "quantity": 1, "weight": 0.3, "equipped": True},
                {"name": "Lederkleidung", "template_id": "tuchruestung", "quantity": 1, "weight": 2.0, "equipped": True},
                {"name": "Pfeile", "template_id": "pfeil", "quantity": 40, "weight": 1.0},
                {"name": "Seil (10 Schritt)", "template_id": "seil", "quantity": 1, "weight": 1.0},
                {"name": "Feuerstahl", "template_id": "feuerstein_stahl", "quantity": 1, "weight": 0.1},
                {"name": "Proviant (5 Tage)", "template_id": "proviant_tag", "quantity": 5, "weight": 1.5},
                {"name": "Silbertaler", "template_id": "silbermuenze", "quantity": 25, "weight": 0.15},
            ],
        },
    ]

    for char_data in characters:
        if not char_data["user_id"]:
            continue
        existing = session.query(Character).filter_by(
            user_id=char_data["user_id"], name=char_data["name"]
        ).first()
        if existing:
            log.info("  Character already exists: %s", char_data["name"])
            continue

        char = Character(id=str(uuid4()), **char_data)
        session.add(char)
        log.info("  Created character: %s (%s)", char_data["name"], char_data["species"])


def _create_test_campaign(session: Session, user_ids: Dict[str, str]):
    """Create a test campaign with all players assigned."""
    gm_id = user_ids.get("gm@test.de")
    if not gm_id:
        return

    existing = session.query(Campaign).filter_by(campaign_code="ORKTURM-42").first()
    if existing:
        log.info("  Test campaign already exists: ORKTURM-42")
        return

    # Create group
    group_id = str(uuid4())
    group = Group(
        id=group_id,
        name="Die Tavernentrinker",
        created_by=gm_id,
    )
    session.add(group)

    # Add all users to group
    for email, uid in user_ids.items():
        member = GroupMember(
            id=str(uuid4()),
            group_id=group_id,
            user_id=uid,
            display_name=email.split("@")[0].replace("player", "Spieler "),
            role="admin" if email == "gm@test.de" else "member",
        )
        session.add(member)

    # Create campaign
    campaign_id = str(uuid4())
    campaign = Campaign(
        id=campaign_id,
        name="Der Turm des Orkschamanen",
        description="Ein Abenteuer im Mittelreich nahe Gareth. Die Helden müssen den Turm eines mächtigen Orkschamanen infiltrieren und das gestohlene Schwert des Königs zurückbringen.",
        group_id=group_id,
        gm_user_id=gm_id,
        complexity_level="standard",
        campaign_code="ORKTURM-42",
        status="active",
        weather="klar",
        world_clock={"date": "Praios 15, 1041 BF", "time": "Nachmittag", "day_night": "tag"},
    )
    session.add(campaign)

    # Assign characters to campaign
    player_emails = ["player1@test.de", "player2@test.de", "player3@test.de", "player4@test.de"]
    for email in player_emails:
        uid = user_ids.get(email)
        if not uid:
            continue
        char = session.query(Character).filter_by(user_id=uid).first()
        if not char:
            continue

        cp = CampaignPlayer(
            id=str(uuid4()),
            campaign_id=campaign_id,
            user_id=uid,
            character_id=str(char.id),
            status="active",
            campaign_snapshot={
                "current_lep": char.derived_values.get("LeP_max", 30),
                "current_asp": char.derived_values.get("AsP_max", 0),
                "current_kap": char.derived_values.get("KaP_max", 0),
                "current_schip": char.derived_values.get("Schip", 3),
                "conditions": {},
                "campaign_inventory": char.basis_inventory or [],
            },
        )
        session.add(cp)

        # Set character to active
        char.status = "active"

    log.info("  Created campaign: Der Turm des Orkschamanen (Code: ORKTURM-42)")


def seed(database_url: Optional[str] = None) -> Dict[str, int]:
    """Run the full seed process."""
    settings = get_settings()
    url = database_url or settings.DATABASE_URL_SYNC

    log.info("Connecting to database: %s", url)
    engine = create_engine(url, echo=False)

    # Enable WAL and foreign keys for SQLite
    if "sqlite" in url:
        from sqlalchemy import event as sa_event

        @sa_event.listens_for(engine, "connect")
        def _set_sqlite_pragma(dbapi_conn, connection_record):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    # Ensure tables exist
    Base.metadata.create_all(engine, checkfirst=True)

    # Run lightweight migrations for existing tables
    if "sqlite" in url:
        from database import (
            _migrate_add_user_contribution_columns,
            _migrate_add_character_creation_fields,
            _migrate_add_species_extra_columns,
        )
        with engine.connect() as conn:
            _migrate_add_user_contribution_columns(conn)
            _migrate_add_character_creation_fields(conn)
            _migrate_add_species_extra_columns(conn)
            conn.commit()

    results: Dict[str, int] = {}
    all_records: Dict[str, List[dict]] = {}

    with Session(engine) as session:
        # Seed combat techniques first (needed for cross-ref validation)
        log.info("Seeding combat techniques...")
        _seed_combat_techniques(session)

        # Seed databank
        for filename, (model, _json_cols) in SEED_MAP.items():
            filepath = SEED_DIR / filename
            if not filepath.exists():
                log.warning("Seed file not found, skipping: %s", filepath)
                results[filename] = 0
                continue

            records = _load_json(filepath)
            all_records[filename] = records
            entity_type = _FILE_TO_ENTITY.get(filename)
            log.info("Upserting %d records from %s into %s ...",
                     len(records), filename, model.__tablename__)

            count = _upsert_batch(session, model, records, entity_type=entity_type)
            results[filename] = count
            log.info("  -> %d rows affected", count)

        # Cross-reference validation
        log.info("Running cross-reference validation...")
        xref_warnings = _validate_cross_references(session, all_records)
        if xref_warnings:
            for w in xref_warnings:
                log.warning("  XREF: %s", w)
            log.warning("  %d cross-reference issue(s) found", len(xref_warnings))
        else:
            log.info("  All cross-references OK")

        # Seed profession starting equipment from separate mapping file
        log.info("Seeding profession starting equipment...")
        equip_count = _seed_profession_equipment(session)
        results["profession_equipment.json"] = equip_count

        # Seed wiki pages
        log.info("Seeding wiki pages...")
        wiki_count = _seed_wiki_pages(session)
        results["wiki_pages.json"] = wiki_count

        # Create test accounts
        log.info("Creating test accounts...")
        user_ids = _create_test_accounts(session)

        # Create test characters
        log.info("Creating test characters...")
        _create_test_characters(session, user_ids)

        session.commit()

        # Create test campaign (needs committed users/characters)
        log.info("Creating test campaign...")
        _create_test_campaign(session, user_ids)

        session.commit()
        log.info("Seed complete. Committed all changes.")

    return results


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Seed the DSA5 databank and create test accounts.")
    parser.add_argument(
        "--database-url",
        default=None,
        help="Override sync database URL (default: from .env / config).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Load and validate JSON files without writing to DB.",
    )
    args = parser.parse_args()

    if args.dry_run:
        log.info("=== DRY RUN MODE ===")
        total = 0
        for filename in SEED_MAP:
            filepath = SEED_DIR / filename
            if not filepath.exists():
                log.warning("MISSING: %s", filepath)
                continue
            records = _load_json(filepath)
            log.info("OK  %s: %d records", filename, len(records))
            total += len(records)
        log.info("=== DRY RUN COMPLETE: %d total records across %d files ===",
                 total, len(SEED_MAP))
    else:
        results = seed(database_url=args.database_url)
        total = sum(results.values())
        log.info("=== SEED SUMMARY ===")
        for fname, count in results.items():
            log.info("  %s: %d rows", fname, count)
        log.info("Total: %d databank rows across %d files", total, len(results))
        log.info("")
        log.info("=== TEST ACCOUNTS ===")
        log.info("  GM:      gm@test.de      / test1234")
        log.info("  Player1: player1@test.de  / test1234  (Balgra Felszorn, Zwerg Krieger)")
        log.info("  Player2: player2@test.de  / test1234  (Elara Sternenfunke, Elf Magierin)")
        log.info("  Player3: player3@test.de  / test1234  (Thorben Praiosmund, Peraine-Geweihter)")
        log.info("  Player4: player4@test.de  / test1234  (Yara Falkenauge, Halbelf Jägerin)")
        log.info("")
        log.info("  Campaign: 'Der Turm des Orkschamanen' (Code: ORKTURM-42)")

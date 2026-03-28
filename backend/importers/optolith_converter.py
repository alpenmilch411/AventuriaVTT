"""Optolith YAML → AventuriaVTT seed JSON converter.

Reads Optolith's authoritative DSA5 YAML data (de-DE locale + univ structured data)
and produces seed JSON files matching the format expected by databank/seed.py.

Usage:
    # Dry run — prints counts and sample entries, writes nothing
    python -m importers.optolith_converter --dry-run

    # Convert all categories
    python -m importers.optolith_converter --optolith-dir /tmp/optolith-data/app/Database/Data

    # Convert specific categories only
    python -m importers.optolith_converter --category species cultures spells

    # Write output to a different directory
    python -m importers.optolith_converter --output-dir /tmp/seed-output

Available categories:
    species, cultures, professions, advantages, disadvantages,
    spells, liturgies, cantrips, blessings, special_abilities,
    talents, combat_techniques, weapons, armor, shields, items

Notes:
    - Idempotent: safe to re-run, overwrites output files each time.
    - Does NOT modify the database — only generates JSON files.
    - Some Optolith data is free-text German (e.g. spell effects).
      These are preserved as-is in description/rules_text fields.
    - Optolith IDs (R_1, C_1, SPELL_1 etc.) are stored in optolith_id
      where the model supports it; our primary IDs are slug-style strings.
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
from pathlib import Path
from typing import Any

import yaml

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("optolith_converter")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
DEFAULT_OPTOLITH_DIR = Path("/tmp/optolith-data/app/Database/Data")
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent / "databank-seed"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_yaml(path: Path) -> list[dict]:
    """Load a YAML file and return its contents as a list of dicts."""
    if not path.exists():
        log.warning("YAML file not found: %s", path)
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data if isinstance(data, list) else []


def _slugify(name: str) -> str:
    """Convert a German name to a URL/ID-safe slug."""
    slug = name.lower().strip()
    # German character replacements
    replacements = {
        "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss",
        "Ä": "ae", "Ö": "oe", "Ü": "ue",
    }
    for old, new in replacements.items():
        slug = slug.replace(old, new)
    # Replace non-alphanumeric with underscore
    slug = re.sub(r"[^a-z0-9]+", "_", slug)
    slug = slug.strip("_")
    return slug


def _build_lookup(items: list[dict]) -> dict[str, dict]:
    """Build an id -> item lookup dict from a YAML list."""
    return {item["id"]: item for item in items if "id" in item}


def _write_json(records: list[dict], output_path: Path, dry_run: bool = False) -> int:
    """Write records to a JSON file. Returns count of records."""
    if dry_run:
        log.info("  [DRY RUN] Would write %d records to %s", len(records), output_path.name)
        if records:
            log.info("  Sample: %s", json.dumps(records[0], ensure_ascii=False, indent=2)[:500])
        return len(records)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    log.info("  Wrote %d records to %s", len(records), output_path.name)
    return len(records)


# ---------------------------------------------------------------------------
# Optolith reference data loaders (cached)
# ---------------------------------------------------------------------------

class OptolithData:
    """Lazy-loaded Optolith reference data with lookup tables."""

    def __init__(self, base_dir: Path):
        self.de = base_dir / "de-DE"
        self.univ = base_dir / "univ"
        self._cache: dict[str, Any] = {}

    def _get(self, key: str, path: Path) -> list[dict]:
        if key not in self._cache:
            self._cache[key] = _load_yaml(path)
        return self._cache[key]

    # de-DE text files
    @property
    def races_de(self): return self._get("races_de", self.de / "Races.yaml")
    @property
    def cultures_de(self): return self._get("cultures_de", self.de / "Cultures.yaml")
    @property
    def professions_de(self): return self._get("professions_de", self.de / "Professions.yaml")
    @property
    def advantages_de(self): return self._get("advantages_de", self.de / "Advantages.yaml")
    @property
    def disadvantages_de(self): return self._get("disadvantages_de", self.de / "Disadvantages.yaml")
    @property
    def spells_de(self): return self._get("spells_de", self.de / "Spells.yaml")
    @property
    def liturgies_de(self): return self._get("liturgies_de", self.de / "LiturgicalChants.yaml")
    @property
    def special_abilities_de(self): return self._get("sa_de", self.de / "SpecialAbilities.yaml")
    @property
    def skills_de(self): return self._get("skills_de", self.de / "Skills.yaml")
    @property
    def combat_techniques_de(self): return self._get("ct_de", self.de / "CombatTechniques.yaml")
    @property
    def equipment_de(self): return self._get("equip_de", self.de / "Equipment.yaml")
    @property
    def attributes_de(self): return self._get("attr_de", self.de / "Attributes.yaml")
    @property
    def reaches_de(self): return self._get("reaches_de", self.de / "Reaches.yaml")
    @property
    def magical_traditions_de(self): return self._get("mtrad_de", self.de / "MagicalTraditions.yaml")
    @property
    def blessed_traditions_de(self): return self._get("btrad_de", self.de / "BlessedTraditions.yaml")
    @property
    def properties_de(self): return self._get("props_de", self.de / "Properties.yaml")
    @property
    def equipment_groups_de(self): return self._get("eqgrp_de", self.de / "EquipmentGroups.yaml")
    @property
    def sa_groups_de(self): return self._get("sagrp_de", self.de / "SpecialAbilityGroups.yaml")
    @property
    def books_de(self): return self._get("books_de", self.de / "Books.yaml")
    @property
    def race_variants_de(self): return self._get("rv_de", self.de / "RaceVariants.yaml")
    @property
    def cantrips_de(self): return self._get("cantrips_de", self.de / "Cantrips.yaml")
    @property
    def blessings_de(self): return self._get("blessings_de", self.de / "Blessings.yaml")
    @property
    def spell_enhancements_de(self): return self._get("se_de", self.de / "SpellEnhancements.yaml")
    @property
    def liturgy_enhancements_de(self): return self._get("le_de", self.de / "LiturgicalChantEnhancements.yaml")
    @property
    def profession_variants_de(self): return self._get("pv_de", self.de / "ProfessionVariants.yaml")

    # univ structured files
    @property
    def races_univ(self): return self._get("races_univ", self.univ / "Races.yaml")
    @property
    def cultures_univ(self): return self._get("cultures_univ", self.univ / "Cultures.yaml")
    @property
    def professions_univ(self): return self._get("professions_univ", self.univ / "Professions.yaml")
    @property
    def advantages_univ(self): return self._get("advantages_univ", self.univ / "Advantages.yaml")
    @property
    def disadvantages_univ(self): return self._get("disadvantages_univ", self.univ / "Disadvantages.yaml")
    @property
    def spells_univ(self): return self._get("spells_univ", self.univ / "Spells.yaml")
    @property
    def liturgies_univ(self): return self._get("liturgies_univ", self.univ / "LiturgicalChants.yaml")
    @property
    def special_abilities_univ(self): return self._get("sa_univ", self.univ / "SpecialAbilities.yaml")
    @property
    def skills_univ(self): return self._get("skills_univ", self.univ / "Skills.yaml")
    @property
    def combat_techniques_univ(self): return self._get("ct_univ", self.univ / "CombatTechniques.yaml")
    @property
    def equipment_univ(self): return self._get("equip_univ", self.univ / "Equipment.yaml")
    @property
    def race_variants_univ(self): return self._get("rv_univ", self.univ / "RaceVariants.yaml")
    @property
    def cantrips_univ(self): return self._get("cantrips_univ", self.univ / "Cantrips.yaml")
    @property
    def blessings_univ(self): return self._get("blessings_univ", self.univ / "Blessings.yaml")
    @property
    def spell_enhancements_univ(self): return self._get("se_univ", self.univ / "SpellEnhancements.yaml")
    @property
    def liturgy_enhancements_univ(self): return self._get("le_univ", self.univ / "LiturgicalChantEnhancements.yaml")
    @property
    def profession_variants_univ(self): return self._get("pv_univ", self.univ / "ProfessionVariants.yaml")

    # Lookup dicts
    def _lookup(self, cache_key: str, items: list[dict]) -> dict[str, dict]:
        lk = cache_key + "_lookup"
        if lk not in self._cache:
            self._cache[lk] = _build_lookup(items)
        return self._cache[lk]

    @property
    def attr_map(self) -> dict[str, str]:
        """ATTR_1 -> 'MU', etc."""
        key = "attr_map"
        if key not in self._cache:
            self._cache[key] = {
                a["id"]: a.get("short", a["name"][:2].upper())
                for a in self.attributes_de
            }
        return self._cache[key]

    @property
    def reach_map(self) -> dict[int, str]:
        """1 -> 'kurz', 2 -> 'mittel', etc."""
        key = "reach_map"
        if key not in self._cache:
            self._cache[key] = {
                r["id"]: r["name"].lower() for r in self.reaches_de
            }
        return self._cache[key]

    @property
    def ct_name_map(self) -> dict[str, str]:
        """CT_1 -> 'Armbrüste', etc."""
        key = "ct_name_map"
        if key not in self._cache:
            self._cache[key] = {ct["id"]: ct["name"] for ct in self.combat_techniques_de}
        return self._cache[key]

    @property
    def skill_name_map(self) -> dict[str, str]:
        """TAL_1 -> 'Fliegen', etc."""
        key = "skill_name_map"
        if key not in self._cache:
            self._cache[key] = {s["id"]: s["name"] for s in self.skills_de}
        return self._cache[key]

    @property
    def spell_tradition_map(self) -> dict[str, str]:
        """Maps numeric tradition IDs used in spells to tradition names."""
        key = "spell_trad_map"
        if key not in self._cache:
            # Optolith spell traditions are numbered 1-N, corresponding to
            # MagicalTraditions order. Build from MagicalTraditions.
            mapping = {}
            for i, trad in enumerate(self.magical_traditions_de, start=0):
                # Tradition IDs in spells_univ start at 1
                # The MagicalTraditions file uses SA_* ids
                mapping[i + 1] = trad["name"]
            self._cache[key] = mapping
        return self._cache[key]

    @property
    def liturgy_tradition_map(self) -> dict[str, str]:
        """Maps numeric tradition IDs used in liturgies to tradition names."""
        key = "liturgy_trad_map"
        if key not in self._cache:
            mapping = {}
            for i, trad in enumerate(self.blessed_traditions_de, start=0):
                mapping[i + 1] = trad["name"]
            self._cache[key] = mapping
        return self._cache[key]

    @property
    def equip_name_map(self) -> dict[str, str]:
        """ITEMTPL_1 -> 'Basiliskenzunge', etc."""
        key = "equip_name_map"
        if key not in self._cache:
            self._cache[key] = {e["id"]: e["name"] for e in self.equipment_de}
        return self._cache[key]

    @property
    def sa_name_map(self) -> dict[str, str]:
        """SA_1 -> 'Analytiker', etc."""
        key = "sa_name_map"
        if key not in self._cache:
            self._cache[key] = {sa["id"]: sa["name"] for sa in self.special_abilities_de}
        return self._cache[key]

    @property
    def adv_name_map(self) -> dict[str, str]:
        """ADV_1 -> 'Adel', etc."""
        key = "adv_name_map"
        if key not in self._cache:
            self._cache[key] = {a["id"]: a["name"] for a in self.advantages_de}
        return self._cache[key]

    @property
    def disadv_name_map(self) -> dict[str, str]:
        """DISADV_1 -> 'Angst vor', etc."""
        key = "disadv_name_map"
        if key not in self._cache:
            self._cache[key] = {d["id"]: d.get("nameInWiki", d["name"]) for d in self.disadvantages_de}
        return self._cache[key]

    @property
    def sa_group_map(self) -> dict[int, str]:
        """1 -> 'Allgemein', etc."""
        key = "sa_group_map"
        if key not in self._cache:
            self._cache[key] = {g["id"]: g["name"] for g in self.sa_groups_de}
        return self._cache[key]

    @property
    def property_name_map(self) -> dict[int, str]:
        """1 -> 'Antimagie', 2 -> 'Dämonisch', etc."""
        key = "property_name_map"
        if key not in self._cache:
            self._cache[key] = {p["id"]: p["name"] for p in self.properties_de}
        return self._cache[key]

    @property
    def equip_group_map(self) -> dict[int, str]:
        """1 -> 'Nahkampfwaffen', etc."""
        key = "equip_group_map"
        if key not in self._cache:
            self._cache[key] = {g["id"]: g["name"] for g in self.equipment_groups_de}
        return self._cache[key]

    @property
    def book_name_map(self) -> dict[str, str]:
        """US25001 -> 'Regelwerk', etc."""
        key = "book_name_map"
        if key not in self._cache:
            self._cache[key] = {b["id"]: b["name"] for b in self.books_de}
        return self._cache[key]

    def source_book_for(self, de_entry: dict) -> str | None:
        """Extract primary source book name from a de-DE entry's src field."""
        src = de_entry.get("src")
        if not src or not isinstance(src, list):
            return None
        first_src = src[0]
        book_id = first_src.get("id", "") if isinstance(first_src, dict) else ""
        return self.book_name_map.get(book_id)

    @property
    def race_common_cultures(self) -> dict[str, list[str]]:
        """R_1 -> ['C_1', 'C_3', ...] — aggregated from RaceVariants."""
        key = "race_common_cultures"
        if key not in self._cache:
            mapping: dict[str, set[str]] = {}
            # Direct commonCultures on races
            for race in self.races_univ:
                rid = race["id"]
                mapping[rid] = set(race.get("commonCultures", []))
            # Merge commonCultures from RaceVariants
            rv_lookup = _build_lookup(self.race_variants_univ)
            for race in self.races_univ:
                rid = race["id"]
                for variant_id in race.get("variants", []):
                    rv = rv_lookup.get(variant_id, {})
                    for cc in rv.get("commonCultures", []):
                        mapping.setdefault(rid, set()).add(cc)
            self._cache[key] = {k: sorted(v) for k, v in mapping.items()}
        return self._cache[key]

    @property
    def spell_name_map(self) -> dict[str, str]:
        """SPELL_1 -> 'Adlerauge', etc."""
        key = "spell_name_map"
        if key not in self._cache:
            self._cache[key] = {s["id"]: s["name"] for s in self.spells_de}
        return self._cache[key]

    @property
    def liturgy_name_map(self) -> dict[str, str]:
        """LITURGY_1 -> 'Bann der Dunkelheit', etc."""
        key = "liturgy_name_map"
        if key not in self._cache:
            self._cache[key] = {l["id"]: l["name"] for l in self.liturgies_de}
        return self._cache[key]


# ---------------------------------------------------------------------------
# Category converters
# ---------------------------------------------------------------------------

def convert_species(data: OptolithData) -> list[dict]:
    """Convert Optolith Races → species_templates seed format.

    Includes race variants (Speziesvarianten).
    """
    de_lookup = _build_lookup(data.races_de)
    rv_de_lookup = _build_lookup(data.race_variants_de)
    rv_univ_lookup = _build_lookup(data.race_variants_univ)
    records = []

    for race in data.races_univ:
        oid = race["id"]  # e.g. R_1
        de = de_lookup.get(oid, {})
        name = de.get("name", oid)

        # Parse attribute adjustments from univ data
        attr_adjustments = []
        for adj in race.get("attributeAdjustments", []):
            attr_short = data.attr_map.get(adj["id"], adj["id"])
            attr_adjustments.append({"attr": attr_short, "value": adj["value"]})

        # Selection-based adjustments (e.g. "one attribute of choice +1")
        sel_value = race.get("attributeAdjustmentsSelectionValue", 0)
        sel_list = race.get("attributeAdjustmentsSelectionList", [])
        if sel_value and sel_list:
            # Store as a choice entry
            attr_adjustments.append({
                "choice": True,
                "value": sel_value,
                "options": [data.attr_map.get(a, a) for a in sel_list]
            })

        # Auto advantages
        auto_advs = []
        for adv_id in race.get("automaticAdvantages", []):
            adv_name = data.adv_name_map.get(adv_id, adv_id)
            auto_advs.append(adv_name)

        # Common cultures from RaceVariants
        common_cultures = data.race_common_cultures.get(oid, [])

        # Race variants
        variants = None
        variant_ids = race.get("variants", [])
        if variant_ids:
            variants = []
            for vid in variant_ids:
                rv_de = rv_de_lookup.get(vid, {})
                rv_univ = rv_univ_lookup.get(vid, {})
                vname = rv_de.get("name", vid)
                variant = {
                    "id": vid,
                    "name": vname,
                }
                if rv_de.get("commonAdvantages"):
                    variant["common_advantages"] = rv_de["commonAdvantages"]
                if rv_de.get("commonDisadvantages"):
                    variant["common_disadvantages"] = rv_de["commonDisadvantages"]
                variants.append(variant)

        record = {
            "id": f"species_{_slugify(name)}",
            "name": name,
            "optolith_id": oid,
            "ap_cost": race.get("cost", 0),
            "lep_base": race.get("lp", 5),
            "sk_base": race.get("spi", -5),
            "zk_base": race.get("tou", -5),
            "gs_base": race.get("mov", 8),
            "base_attributes": {
                "MU": 8, "KL": 8, "IN": 8, "CH": 8,
                "FF": 8, "GE": 8, "KO": 8, "KK": 8,
            },
            "attribute_adjustments": attr_adjustments,
            "free_attribute_points": 7,
            "magic_capable": True,
            "blessed_capable": True,
            "common_cultures": common_cultures,
            "auto_advantages": auto_advs,
            "special_rules": [],
            "variants": variants,
            "description": de.get("attributeAdjustments", ""),
            "sk_modifier": race.get("spi", -5),
            "zk_modifier": race.get("tou", -5),
        }
        records.append(record)

    return records


def convert_cultures(data: OptolithData) -> list[dict]:
    """Convert Optolith Cultures → culture_templates seed format."""
    de_lookup = _build_lookup(data.cultures_de)
    records = []

    for culture in data.cultures_univ:
        oid = culture["id"]  # e.g. C_1
        de = de_lookup.get(oid, {})
        name = de.get("name", oid)

        # Cultural package skills → skill_bonuses
        skill_bonuses = {}
        for skill_entry in culture.get("culturalPackageSkills", []):
            skill_id = skill_entry["id"]
            skill_name = data.skill_name_map.get(skill_id, skill_id)
            skill_bonuses[skill_name] = skill_entry["value"]

        # Languages (numeric IDs — we store names if possible)
        # Optolith language IDs are opaque; store as IDs for now
        languages_raw = culture.get("languages", [])

        record = {
            "id": f"culture_{_slugify(name)}",
            "name": name,
            "optolith_id": oid,
            "ap_cost": culture.get("culturalPackageCost", 0),
            "compatible_species": [],
            "skill_bonuses": skill_bonuses,
            "languages": [],
            "scripts": [],
            "source_book": data.source_book_for(de) or "Regelwerk",
            "description": de.get("areaKnowledge", ""),
        }
        records.append(record)

    return records


def convert_professions(data: OptolithData) -> list[dict]:
    """Convert Optolith Professions → profession_templates seed format.

    Includes profession variants (Professionsvarianten).
    """
    de_lookup = _build_lookup(data.professions_de)
    pv_de_lookup = _build_lookup(data.profession_variants_de)
    pv_univ_lookup = _build_lookup(data.profession_variants_univ)
    records = []

    # Group mapping: 1 = mundane, 2 = magic, 3 = blessed
    for prof in data.professions_univ:
        oid = prof["id"]  # e.g. P_1
        de = de_lookup.get(oid, {})

        # Name can be a string or {m: "...", f: "..."} dict
        name_data = de.get("name", oid)
        if isinstance(name_data, dict):
            name = name_data.get("m", str(name_data))
            name_f = name_data.get("f")
        else:
            name = str(name_data)
            name_f = None

        gr = prof.get("gr", 1)

        # Combat techniques
        combat_techs = {}
        for ct_entry in prof.get("combatTechniques", []):
            ct_name = data.ct_name_map.get(ct_entry["id"], ct_entry["id"])
            combat_techs[ct_name] = ct_entry["value"]

        # Skills
        skills = {}
        for skill_entry in prof.get("skills", []):
            skill_name = data.skill_name_map.get(skill_entry["id"], skill_entry["id"])
            skills[skill_name] = skill_entry["value"]

        # Special abilities
        special_abilities = []
        for sa_entry in prof.get("specialAbilities", []):
            sa_id = sa_entry["id"] if isinstance(sa_entry, dict) else sa_entry
            sa_name = data.sa_name_map.get(sa_id, str(sa_id))
            special_abilities.append(sa_name)

        # Spells (for magic professions)
        spells = {}
        for spell_entry in prof.get("spells", []):
            if isinstance(spell_entry, dict):
                sid = spell_entry["id"]
                if isinstance(sid, list):
                    # Choice entry — skip (choice between spells)
                    continue
                spell_name = data.spell_name_map.get(sid, sid)
                spells[spell_name] = spell_entry.get("value", 0)

        # Liturgies (for blessed professions)
        liturgies = {}
        for lit_entry in prof.get("liturgicalChants", []):
            if isinstance(lit_entry, dict):
                lid = lit_entry["id"]
                if isinstance(lid, list):
                    continue
                lit_name = data.liturgy_name_map.get(lid, lid)
                liturgies[lit_name] = lit_entry.get("value", 0)

        # Profession variants
        variants = None
        variant_ids = prof.get("variants", [])
        if variant_ids:
            variants = []
            for vid in variant_ids:
                pv_de = pv_de_lookup.get(vid, {})
                pv_univ = pv_univ_lookup.get(vid, {})
                vname_data = pv_de.get("name", vid)
                if isinstance(vname_data, dict):
                    vname = vname_data.get("m", str(vname_data))
                    vname_f = vname_data.get("f")
                else:
                    vname = str(vname_data)
                    vname_f = None
                variant = {
                    "id": vid,
                    "name": vname,
                    "ap_cost": pv_univ.get("cost", 0),
                }
                if vname_f:
                    variant["name_f"] = vname_f
                # Skill modifications
                pv_skills = {}
                for s in pv_univ.get("skills", []):
                    sname = data.skill_name_map.get(s["id"], s["id"])
                    pv_skills[sname] = s["value"]
                if pv_skills:
                    variant["skills"] = pv_skills
                if pv_de.get("concludingText"):
                    variant["note"] = pv_de["concludingText"]
                variants.append(variant)

        record = {
            "id": f"profession_{_slugify(name)}",
            "name": name,
            "optolith_id": oid,
            "ap_cost": prof.get("cost", 0),
            "requires_magic": gr == 2,
            "requires_blessed": gr == 3,
            "combat_techniques": combat_techs,
            "skills": skills,
            "special_abilities": special_abilities,
            "spells": spells,
            "liturgies": liturgies,
            "source_book": data.source_book_for(de) or "Regelwerk",
            "description": de.get("suggestedAdvantages", ""),
            "compatible_species": [],
            "variants": variants,
        }
        if name_f:
            record["name_f"] = name_f

        records.append(record)

    return records


def convert_advantages(data: OptolithData) -> list[dict]:
    """Convert Optolith Advantages → advantage_templates seed format."""
    de_lookup = _build_lookup(data.advantages_de)
    records = []

    # SA group mapping for advantage categories
    # gr: 1 = allgemein, 2 = magisch, 3 = karmal
    GR_TO_CATEGORY = {1: "allgemein", 2: "magisch", 3: "karmal"}

    for adv in data.advantages_univ:
        oid = adv["id"]  # e.g. ADV_1
        if oid == "ADV_0":
            continue  # Skip placeholder

        de = de_lookup.get(oid, {})
        name = de.get("name", oid)

        # AP cost — can be int or list (for variable-cost advantages)
        cost = adv.get("cost", 0)
        if isinstance(cost, list):
            ap_cost = cost[0] if cost else 0
        else:
            ap_cost = cost

        levels = adv.get("levels", 1)
        max_levels = adv.get("max", 1)

        # Rules text from de-DE
        rules = de.get("rules", "").strip()
        ap_value_text = de.get("apValue", "")

        record = {
            "id": _slugify(name),
            "name": name,
            "ap_cost": ap_cost,
            "category": GR_TO_CATEGORY.get(adv.get("gr", 1), "allgemein"),
            "levels": levels if levels else 1,
            "prerequisites": None,
            "description": rules[:200] if rules else None,
            "rules_text": rules if rules else None,
            "source_book": data.source_book_for(de),
        }
        records.append(record)

    return records


def convert_disadvantages(data: OptolithData) -> list[dict]:
    """Convert Optolith Disadvantages → disadvantage_templates seed format."""
    de_lookup = _build_lookup(data.disadvantages_de)
    records = []

    GR_TO_CATEGORY = {1: "allgemein", 2: "magisch", 3: "karmal"}

    for disadv in data.disadvantages_univ:
        oid = disadv["id"]
        if oid == "DISADV_0":
            continue

        de = de_lookup.get(oid, {})
        name = de.get("nameInWiki", de.get("name", oid))

        cost = disadv.get("cost", 0)
        if isinstance(cost, list):
            ap_cost = cost[0] if cost else 0
        else:
            ap_cost = cost

        levels = disadv.get("levels", 1)
        rules = de.get("rules", "").strip()

        record = {
            "id": _slugify(name),
            "name": name,
            "ap_cost": ap_cost,
            "category": GR_TO_CATEGORY.get(disadv.get("gr", 1), "allgemein"),
            "levels": levels if levels else 1,
            "prerequisites": None,
            "description": rules[:200] if rules else None,
            "rules_text": rules if rules else None,
            "source_book": data.source_book_for(de),
        }
        records.append(record)

    return records


def convert_spells(data: OptolithData) -> list[dict]:
    """Convert Optolith Spells → spell_templates seed format.

    Includes enhancements (Zaubererweiterungen) and property (Merkmal).
    """
    de_lookup = _build_lookup(data.spells_de)

    # Build spell enhancement lookup: SPELL_89 -> [{level, name, effect, cost}, ...]
    se_de_lookup: dict[str, dict] = {}
    for se in data.spell_enhancements_de:
        se_de_lookup[se["target"]] = se
    se_univ_lookup: dict[str, dict] = {}
    for se in data.spell_enhancements_univ:
        se_univ_lookup[se["target"]] = se

    records = []

    for spell in data.spells_univ:
        oid = spell["id"]  # e.g. SPELL_1
        de = de_lookup.get(oid, {})
        name = de.get("name", oid)

        # Probe (check attributes)
        probe = []
        for check_key in ["check1", "check2", "check3"]:
            attr_id = spell.get(check_key)
            if attr_id:
                probe.append(data.attr_map.get(attr_id, attr_id))

        # Traditions
        traditions = []
        for trad_id in spell.get("traditions", []):
            trad_name = data.spell_tradition_map.get(trad_id, str(trad_id))
            traditions.append(trad_name)

        # checkMod from univ (some spells have built-in modifiers)
        check_mod = spell.get("checkMod") or 0

        # Property (Merkmal) — numeric ID → name
        prop_id = spell.get("property")
        prop_name = data.property_name_map.get(prop_id) if prop_id else None

        # Enhancements (Zaubererweiterungen)
        enhancements = None
        se_de = se_de_lookup.get(oid)
        se_univ = se_univ_lookup.get(oid)
        if se_de:
            enhancements = []
            for lvl_key in ["level1", "level2", "level3"]:
                lvl_de = se_de.get(lvl_key)
                lvl_univ = (se_univ or {}).get(lvl_key)
                if lvl_de:
                    enh = {
                        "level": int(lvl_key[-1]),
                        "name": lvl_de.get("name", ""),
                        "effect": (lvl_de.get("effect", "") or "").strip(),
                    }
                    # AP cost from univ
                    if lvl_univ and "cost" in lvl_univ:
                        enh["cost"] = lvl_univ["cost"]
                    enhancements.append(enh)

        record = {
            "id": _slugify(name),
            "name": name,
            "tradition": traditions,
            "probe": probe,
            "check_mod": check_mod,
            "casting_time": de.get("castingTime") or de.get("castingTimeShort", ""),
            "asp_cost": de.get("aeCost") or de.get("aeCostShort", ""),
            "range": de.get("range") or de.get("rangeShort", ""),
            "duration": de.get("duration") or de.get("durationShort", ""),
            "target": de.get("target", ""),
            "effect_per_qs": None,
            "description": (de.get("effect", "") or "").strip()[:500],
            "damage": None,
            "condition_inflicted": None,
            "buff_effect": None,
            "improvement_cost": spell.get("ic"),
            "property": prop_name,
            "enhancements": enhancements,
        }
        records.append(record)

    return records


def convert_liturgies(data: OptolithData) -> list[dict]:
    """Convert Optolith LiturgicalChants → liturgy_templates seed format.

    Includes enhancements (Liturgieerweiterungen).
    """
    de_lookup = _build_lookup(data.liturgies_de)

    # Build liturgy enhancement lookup: LITURGY_41 -> {level1, level2, level3}
    le_de_lookup: dict[str, dict] = {}
    for le in data.liturgy_enhancements_de:
        le_de_lookup[le["target"]] = le
    le_univ_lookup: dict[str, dict] = {}
    for le in data.liturgy_enhancements_univ:
        le_univ_lookup[le["target"]] = le

    records = []

    for liturgy in data.liturgies_univ:
        oid = liturgy["id"]  # e.g. LITURGY_1
        de = de_lookup.get(oid, {})
        name = de.get("name", oid)

        probe = []
        for check_key in ["check1", "check2", "check3"]:
            attr_id = liturgy.get(check_key)
            if attr_id:
                probe.append(data.attr_map.get(attr_id, attr_id))

        traditions = []
        for trad_id in liturgy.get("traditions", []):
            trad_name = data.liturgy_tradition_map.get(trad_id, str(trad_id))
            traditions.append(trad_name)

        check_mod = liturgy.get("checkMod") or 0

        # Enhancements (Liturgieerweiterungen)
        enhancements = None
        le_de = le_de_lookup.get(oid)
        le_univ = le_univ_lookup.get(oid)
        if le_de:
            enhancements = []
            for lvl_key in ["level1", "level2", "level3"]:
                lvl_de = le_de.get(lvl_key)
                lvl_univ = (le_univ or {}).get(lvl_key)
                if lvl_de:
                    enh = {
                        "level": int(lvl_key[-1]),
                        "name": lvl_de.get("name", ""),
                        "effect": (lvl_de.get("effect", "") or "").strip(),
                    }
                    if lvl_univ and "cost" in lvl_univ:
                        enh["cost"] = lvl_univ["cost"]
                    enhancements.append(enh)

        record = {
            "id": _slugify(name),
            "name": name,
            "tradition": traditions,
            "probe": probe,
            "check_mod": check_mod,
            "casting_time": de.get("castingTime") or de.get("castingTimeShort", ""),
            "kap_cost": de.get("kpCost") or de.get("kpCostShort", ""),
            "range": de.get("range") or de.get("rangeShort", ""),
            "duration": de.get("duration") or de.get("durationShort", ""),
            "target": de.get("target", ""),
            "effect_per_qs": None,
            "description": (de.get("effect", "") or "").strip()[:500],
            "damage": None,
            "condition_inflicted": None,
            "buff_effect": None,
            "improvement_cost": liturgy.get("ic"),
            "enhancements": enhancements,
        }
        records.append(record)

    return records


def convert_special_abilities(data: OptolithData) -> list[dict]:
    """Convert Optolith SpecialAbilities → special_ability_templates seed format."""
    de_lookup = _build_lookup(data.special_abilities_de)
    records = []

    # Map SA group IDs to our category names
    SA_GR_CATEGORY = {
        1: "allgemein", 2: "schicksal", 3: "nahkampf",
        4: "magisch", 5: "stabzauber", 6: "hexe",
        7: "karmal", 8: "bannkreis", 9: "kampfstil_bewaffnet",
        10: "kampfstil_unbewaffnet", 11: "nahkampf", 12: "befehl",
    }

    for sa in data.special_abilities_univ:
        oid = sa["id"]
        if oid == "SA_0":
            continue

        de = de_lookup.get(oid, {})
        name = de.get("name", oid)

        cost = sa.get("cost", 0)
        if isinstance(cost, list):
            ap_cost = cost[0] if cost else 0
        elif isinstance(cost, dict):
            # Some have selectOptions with individual costs
            ap_cost = 0
        else:
            ap_cost = cost or 0

        gr = sa.get("gr", 1)
        category = SA_GR_CATEGORY.get(gr, data.sa_group_map.get(gr, "allgemein").lower())

        rules = (de.get("rules") or de.get("effect") or "").strip()

        record = {
            "id": _slugify(name),
            "name": name,
            "category": category,
            "prerequisites": [],
            "ap_cost": ap_cost,
            "at_mod": None,
            "pa_mod": None,
            "damage_modifier": None,
            "combinable_with": [],
            "exclusive_with": [],
            "applicable_techniques": [],
            "description": rules[:300] if rules else None,
            "rules_text": rules if rules else None,
            "source_book": data.source_book_for(de),
        }
        records.append(record)

    return records


def convert_talents(data: OptolithData) -> list[dict]:
    """Convert Optolith Skills → talent_templates seed format."""
    de_lookup = _build_lookup(data.skills_de)
    records = []

    # Skill group mapping: 1=körper, 2=gesellschaft, 3=natur, 4=wissen, 5=handwerk
    GR_TO_CATEGORY = {
        1: "körper", 2: "gesellschaft", 3: "natur", 4: "wissen", 5: "handwerk"
    }

    for skill in data.skills_univ:
        oid = skill["id"]
        de = de_lookup.get(oid, {})
        name = de.get("name", oid)

        probe = []
        for check_key in ["check1", "check2", "check3"]:
            attr_id = skill.get(check_key)
            if attr_id:
                probe.append(data.attr_map.get(attr_id, attr_id))

        # Applications from de-DE
        applications = []
        for app in de.get("applications", []):
            if isinstance(app, dict):
                applications.append(app.get("name", ""))
            else:
                applications.append(str(app))

        enc = skill.get("enc", "nein")
        if enc == "true":
            encumbrance = "ja"
        elif enc == "maybe":
            encumbrance = "vielleicht"
        else:
            encumbrance = "nein"

        record = {
            "id": _slugify(name),
            "name": name,
            "category": GR_TO_CATEGORY.get(skill.get("gr", 1), "körper"),
            "probe": probe,
            "applications": applications,
            "encumbrance": encumbrance,
            "description": de.get("quality", "").strip() if de.get("quality") else None,
        }
        records.append(record)

    return records


def convert_combat_techniques(data: OptolithData) -> list[dict]:
    """Convert Optolith CombatTechniques — these are already hardcoded in seed.py,
    but we generate the JSON for reference/comparison."""
    de_lookup = _build_lookup(data.combat_techniques_de)
    records = []

    for ct in data.combat_techniques_univ:
        oid = ct["id"]
        de = de_lookup.get(oid, {})
        name = de.get("name", oid)

        primary = []
        for attr_id in ct.get("primary", []):
            primary.append(data.attr_map.get(attr_id, attr_id))

        category = "fernkampf" if ct.get("gr", 1) == 2 else "nahkampf"
        can_parry = not ct.get("hasNoParry", False) and category == "nahkampf"

        record = {
            "id": f"kt_{_slugify(name)}",
            "name": name,
            "category": category,
            "primary_attribute": primary,
            "improvement_cost": ct.get("ic", "B"),
            "can_parry": can_parry,
            "special_rules": de.get("special", "").strip() if de.get("special") else None,
        }
        records.append(record)

    return records


def convert_weapons(data: OptolithData) -> list[dict]:
    """Convert Optolith Equipment (gr=1, melee weapons) → weapon_templates seed format."""
    equip_univ = _build_lookup(data.equipment_univ)
    records = []

    for item in data.equipment_univ:
        if item.get("gr") != 1:
            continue

        oid = item["id"]
        name = data.equip_name_map.get(oid, oid)
        spec = item.get("special", {})

        if not spec or "combatTechnique" not in spec:
            continue

        ct_id = spec["combatTechnique"]
        ct_name = data.ct_name_map.get(ct_id, ct_id)

        # Shield items (CT_10 = Schilde) go to shields converter
        if ct_id == "CT_10":
            continue

        dice_num = spec.get("damageDiceNumber", 1)
        dice_sides = spec.get("damageDiceSides", 6)
        flat = spec.get("damageFlat", 0)
        damage = f"{dice_num}W{dice_sides}"
        if flat > 0:
            damage += f"+{flat}"
        elif flat < 0:
            damage += str(flat)

        reach_id = spec.get("reach", 2)
        reach = data.reach_map.get(reach_id, "mittel")

        record = {
            "id": _slugify(name),
            "name": name,
            "combat_technique": ct_name,
            "damage": damage,
            "at_mod": spec.get("at", 0),
            "pa_mod": spec.get("pa", 0),
            "reach": reach,
            "weight": item.get("weight"),
            "price": item.get("price"),
            "two_handed": spec.get("isTwoHandedWeapon", False),
            "properties": [],
            "damage_type": None,
            "is_ranged": False,
            "range_brackets": None,
            "reload_time": None,
            "ammunition": None,
            "description": None,
        }
        records.append(record)

    return records


def convert_ranged_weapons(data: OptolithData) -> list[dict]:
    """Convert Optolith Equipment (gr=2, ranged weapons) → weapon_templates seed format."""
    records = []

    for item in data.equipment_univ:
        if item.get("gr") != 2:
            continue

        oid = item["id"]
        name = data.equip_name_map.get(oid, oid)
        spec = item.get("special", {})

        if not spec or "combatTechnique" not in spec:
            continue

        ct_id = spec["combatTechnique"]
        ct_name = data.ct_name_map.get(ct_id, ct_id)

        dice_num = spec.get("damageDiceNumber", 1)
        dice_sides = spec.get("damageDiceSides", 6)
        flat = spec.get("damageFlat", 0)
        damage = f"{dice_num}W{dice_sides}"
        if flat > 0:
            damage += f"+{flat}"
        elif flat < 0:
            damage += str(flat)

        range_brackets = None
        close_r = spec.get("closeRange")
        med_r = spec.get("mediumRange")
        far_r = spec.get("farRange")
        if close_r is not None:
            range_brackets = {"nah": close_r, "mittel": med_r, "fern": far_r}

        ammo = spec.get("ammunition")
        ammo_name = data.equip_name_map.get(ammo, ammo) if ammo else None

        record = {
            "id": _slugify(name),
            "name": name,
            "combat_technique": ct_name,
            "damage": damage,
            "at_mod": spec.get("at", 0),
            "pa_mod": None,
            "reach": None,
            "weight": item.get("weight"),
            "price": item.get("price"),
            "two_handed": spec.get("isTwoHandedWeapon", True),
            "properties": [],
            "damage_type": None,
            "is_ranged": True,
            "range_brackets": range_brackets,
            "reload_time": spec["reloadTime"][0] if isinstance(spec.get("reloadTime"), list) else spec.get("reloadTime"),
            "ammunition": ammo_name,
            "description": None,
        }
        records.append(record)

    return records


def convert_armor(data: OptolithData) -> list[dict]:
    """Convert Optolith Equipment (gr=4, armor) → armor_templates seed format."""
    records = []

    for item in data.equipment_univ:
        if item.get("gr") != 4:
            continue

        oid = item["id"]
        name = data.equip_name_map.get(oid, oid)
        spec = item.get("special", {})

        rs = spec.get("protection")
        be = spec.get("encumbrance")
        if rs is None and be is None:
            continue  # Skip items without armor stats

        record = {
            "id": _slugify(name),
            "name": name,
            "rs": rs or 0,
            "be": be or 0,
            "weight": item.get("weight"),
            "price": item.get("price"),
            "zones": None,
            "properties": [],
            "description": None,
        }
        records.append(record)

    return records


def convert_shields(data: OptolithData) -> list[dict]:
    """Convert Optolith Equipment (shields = CT_10 weapons) → shield_templates seed format."""
    records = []

    for item in data.equipment_univ:
        if item.get("gr") != 1:
            continue

        spec = item.get("special", {})
        if spec.get("combatTechnique") != "CT_10":
            continue

        oid = item["id"]
        name = data.equip_name_map.get(oid, oid)

        record = {
            "id": _slugify(name),
            "name": name,
            "at_mod": spec.get("at", 0),
            "pa_mod": spec.get("pa", 0),
            "weight": item.get("weight"),
            "price": item.get("price"),
            "description": None,
        }
        records.append(record)

    return records


def convert_items(data: OptolithData) -> list[dict]:
    """Convert Optolith Equipment (general items, gr >= 5) → item_templates seed format."""
    records = []

    # Equipment groups that map to general items (not weapons/armor/shields/ammo)
    ITEM_GROUPS = set(range(5, 31))  # Groups 5-30 are general equipment

    # Group → category mapping
    GROUP_CATEGORY = {
        5: "Waffenzubehör", 6: "Kleidung", 7: "Reisebedarf",
        8: "Beleuchtung", 9: "Heilmittel", 10: "Behältnisse",
        11: "Seile", 12: "Diebeswerkzeug", 13: "Handwerkszeug",
        14: "Orientierung", 15: "Schmuck", 16: "Edelsteine",
        17: "Schreibwaren", 18: "Bücher", 19: "Artefakte",
        20: "Alchimica", 21: "Gifte", 22: "Heilkräuter",
        23: "Musikinstrumente", 24: "Genussmittel", 25: "Tiere",
        26: "Tierbedarf", 27: "Fortbewegung", 28: "Geweihtenschaft",
        29: "Zeremonialgegenstände", 30: "Sonstiges",
    }

    for item in data.equipment_univ:
        gr = item.get("gr", 0)
        if gr not in ITEM_GROUPS:
            continue
        # Skip items that happen to have weapon stats (improvised weapons)
        if item.get("special", {}).get("combatTechnique"):
            continue

        oid = item["id"]
        name = data.equip_name_map.get(oid, oid)

        category = GROUP_CATEGORY.get(gr, data.equip_group_map.get(gr, "Sonstiges"))

        record = {
            "id": _slugify(name),
            "name": name,
            "category": category,
            "weight": item.get("weight"),
            "price": item.get("price"),
            "stackable": gr in (20, 21, 22, 24),  # Consumables are stackable
            "usable": gr in (9, 20, 21, 22),
            "consumable": gr in (20, 21, 22),
            "description": None,
        }
        records.append(record)

    return records


def convert_cantrips(data: OptolithData) -> list[dict]:
    """Convert Optolith Cantrips → cantrip_templates seed format."""
    de_lookup = _build_lookup(data.cantrips_de)
    records = []

    for cantrip in data.cantrips_univ:
        oid = cantrip["id"]  # e.g. CANTRIP_1
        de = de_lookup.get(oid, {})
        name = de.get("name", oid)

        # Traditions
        traditions = []
        for trad_id in cantrip.get("traditions", []):
            trad_name = data.spell_tradition_map.get(trad_id, str(trad_id))
            traditions.append(trad_name)

        record = {
            "id": _slugify(name),
            "name": name,
            "tradition": traditions,
            "effect": (de.get("effect", "") or "").strip(),
            "range": de.get("range", ""),
            "duration": de.get("duration", ""),
            "target": de.get("target", ""),
            "source_book": data.source_book_for(de),
        }
        records.append(record)

    return records


def convert_blessings(data: OptolithData) -> list[dict]:
    """Convert Optolith Blessings → blessing_templates seed format."""
    de_lookup = _build_lookup(data.blessings_de)
    records = []

    for blessing in data.blessings_univ:
        oid = blessing["id"]  # e.g. BLESSING_1
        de = de_lookup.get(oid, {})
        name = de.get("name", oid)

        # Traditions (blessed traditions)
        traditions = []
        for trad_id in blessing.get("traditions", []):
            trad_name = data.liturgy_tradition_map.get(trad_id, str(trad_id))
            traditions.append(trad_name)

        record = {
            "id": _slugify(name),
            "name": name,
            "tradition": traditions,
            "effect": (de.get("effect", "") or "").strip(),
            "range": de.get("range", ""),
            "duration": de.get("duration", ""),
            "target": de.get("target", ""),
            "source_book": data.source_book_for(de),
        }
        records.append(record)

    return records


# ---------------------------------------------------------------------------
# Main converter orchestration
# ---------------------------------------------------------------------------

CONVERTERS = {
    "species": ("species.json", convert_species),
    "cultures": ("cultures.json", convert_cultures),
    "professions": ("professions.json", convert_professions),
    "advantages": ("advantages.json", convert_advantages),
    "disadvantages": ("disadvantages.json", convert_disadvantages),
    "spells": ("spells.json", convert_spells),
    "liturgies": ("liturgies.json", convert_liturgies),
    "cantrips": ("cantrips.json", convert_cantrips),
    "blessings": ("blessings.json", convert_blessings),
    "special_abilities": ("special_abilities.json", convert_special_abilities),
    "talents": ("talents.json", convert_talents),
    "combat_techniques": ("combat_techniques.json", convert_combat_techniques),
    "weapons": ("weapons.json", None),  # Combined: melee + ranged
    "armor": ("armor.json", convert_armor),
    "shields": ("shields.json", convert_shields),
    "items": ("items.json", convert_items),
}


def run_converter(
    optolith_dir: Path,
    output_dir: Path,
    categories: list[str] | None = None,
    dry_run: bool = False,
) -> dict[str, int]:
    """Run the converter for specified categories (or all)."""
    data = OptolithData(optolith_dir)
    results: dict[str, int] = {}

    cats = categories or list(CONVERTERS.keys())

    for cat in cats:
        if cat not in CONVERTERS:
            log.warning("Unknown category: %s (available: %s)", cat, ", ".join(CONVERTERS.keys()))
            continue

        filename, converter = CONVERTERS[cat]
        log.info("Converting: %s → %s", cat, filename)

        if cat == "weapons":
            # Weapons are melee + ranged combined
            melee = convert_weapons(data)
            ranged = convert_ranged_weapons(data)
            records = melee + ranged
            log.info("  Melee: %d, Ranged: %d", len(melee), len(ranged))
        else:
            records = converter(data)

        if not records:
            log.warning("  No records produced for %s", cat)
            results[cat] = 0
            continue

        # Deduplicate by ID (keep first occurrence)
        seen_ids: set[str] = set()
        unique_records = []
        for rec in records:
            rid = rec.get("id", "")
            if rid in seen_ids:
                log.warning("  Duplicate ID skipped: %s", rid)
                continue
            seen_ids.add(rid)
            unique_records.append(rec)

        output_path = output_dir / filename
        count = _write_json(unique_records, output_path, dry_run=dry_run)
        results[cat] = count

    return results


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Convert Optolith YAML data to AventuriaVTT seed JSON format."
    )
    parser.add_argument(
        "--optolith-dir",
        type=Path,
        default=DEFAULT_OPTOLITH_DIR,
        help=f"Path to Optolith Database/Data directory (default: {DEFAULT_OPTOLITH_DIR})",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory for seed JSON files (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--category",
        nargs="+",
        choices=list(CONVERTERS.keys()),
        help="Convert only specific categories (default: all)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print counts and samples without writing files",
    )
    args = parser.parse_args()

    if not args.optolith_dir.exists():
        log.error("Optolith data directory not found: %s", args.optolith_dir)
        sys.exit(1)

    if not args.dry_run:
        args.output_dir.mkdir(parents=True, exist_ok=True)

    log.info("Optolith source: %s", args.optolith_dir)
    log.info("Output target:   %s", args.output_dir)
    if args.dry_run:
        log.info("=== DRY RUN MODE ===")

    results = run_converter(
        optolith_dir=args.optolith_dir,
        output_dir=args.output_dir,
        categories=args.category,
        dry_run=args.dry_run,
    )

    log.info("=== CONVERSION SUMMARY ===")
    total = 0
    for cat, count in results.items():
        log.info("  %-20s %4d records", cat, count)
        total += count
    log.info("  %-20s %4d records total", "TOTAL", total)


if __name__ == "__main__":
    main()

"""Parser for Optolith character JSON exports.

Optolith is a popular desktop character creation tool for DSA5. Its export
format uses a specific JSON structure with coded IDs (ATTR_1, R_1, TAL_1, etc.)
that must be mapped to human-readable names for the internal model.

Optolith exports characters as JSON with this general structure:
{
    "clientVersion": "1.5.x",
    "id": "...",
    "name": "Character Name",
    "dateCreated": "...",
    "dateModified": "...",
    "phase": 3,
    "locale": "de-DE",
    "ap": {"total": 1100, "spent": 1025},
    "el": "EL_5",
    "r": "R_1",
    "rv": "RV_1",
    "c": "C_1",
    "p": "P_1",
    "pv": "PV_1",
    "sex": "m",
    "pers": {...},
    "attr": [...],
    "activatable": {...},
    "talents": {...},
    "ct": {...},
    "spells": {...},
    "cantrips": [...],
    "liturgies": {...},
    "blessings": [...],
    "belongings": {
        "items": {...},
        "purse": {"d": 0, "s": 0, "h": 0, "k": 0}
    }
}
"""

from __future__ import annotations

import logging
import math
from typing import Any, Optional

log = logging.getLogger("importers.optolith")


class OptolithImporter:
    """Parses Optolith JSON exports into the internal AventuriaVTT character format."""

    # -----------------------------------------------------------------------
    # Mapping tables: Optolith IDs -> human-readable German names
    # -----------------------------------------------------------------------

    ATTRIBUTE_MAP: dict[str, str] = {
        "ATTR_1": "MU",
        "ATTR_2": "KL",
        "ATTR_3": "IN",
        "ATTR_4": "CH",
        "ATTR_5": "FF",
        "ATTR_6": "GE",
        "ATTR_7": "KO",
        "ATTR_8": "KK",
    }

    SPECIES_MAP: dict[str, str] = {
        "R_1": "Mensch",
        "R_2": "Elf",
        "R_3": "Halbelf",
        "R_4": "Zwerg",
    }

    # Base LeP values per species
    SPECIES_LEP_BASE: dict[str, int] = {
        "Mensch": 5,
        "Elf": 2,
        "Halbelf": 5,
        "Zwerg": 8,
    }

    # Base GS values per species
    SPECIES_GS_BASE: dict[str, int] = {
        "Mensch": 8,
        "Elf": 8,
        "Halbelf": 8,
        "Zwerg": 6,
    }

    # Base Schicksalspunkte per species
    SPECIES_SCHIP_BASE: dict[str, int] = {
        "Mensch": 3,
        "Elf": 2,
        "Halbelf": 3,
        "Zwerg": 3,
    }

    CULTURE_MAP: dict[str, str] = {
        "C_1": "Mittelreich",
        "C_2": "Andergast",
        "C_3": "Nostria",
        "C_4": "Almada",
        "C_5": "Horasreich",
        "C_6": "Aranien",
        "C_7": "Tulamidenlande",
        "C_8": "Novadi",
        "C_9": "Ferkina",
        "C_10": "Trollzacker",
        "C_11": "Norbarden",
        "C_12": "Svellttaler",
        "C_13": "Waldmenschen",
        "C_14": "Utulu",
        "C_15": "Krajakischen",
        "C_16": "Fjarninger",
        "C_17": "Gjalskerlaender",
        "C_18": "Thorwaler",
        "C_19": "Nivesen",
        "C_20": "Moha",
        "C_21": "Tocamuyac",
        "C_22": "Miniwatu",
        "C_23": "Auelfen",
        "C_24": "Firnelfen",
        "C_25": "Waldelfen",
        "C_26": "Ambosszwerge",
        "C_27": "Brillantzwerge",
        "C_28": "Erzzwerge",
        "C_29": "Huegelzwerge",
    }

    TALENT_MAP: dict[str, str] = {
        # Koerpertalente
        "TAL_1": "Fliegen",
        "TAL_2": "Gaukeleien",
        "TAL_3": "Klettern",
        "TAL_4": "Koerperbeherrschung",
        "TAL_5": "Kraftakt",
        "TAL_6": "Reiten",
        "TAL_7": "Schwimmen",
        "TAL_8": "Selbstbeherrschung",
        "TAL_9": "Singen",
        "TAL_10": "Sinnesschaerfe",
        "TAL_11": "Tanzen",
        "TAL_12": "Taschendiebstahl",
        "TAL_13": "Verbergen",
        "TAL_14": "Zechen",
        # Gesellschaftstalente
        "TAL_15": "Bekehren & Ueberzeugen",
        "TAL_16": "Betoeren",
        "TAL_17": "Einschuechtern",
        "TAL_18": "Etikette",
        "TAL_19": "Gassenwissen",
        "TAL_20": "Menschenkenntnis",
        "TAL_21": "Ueberreden",
        "TAL_22": "Verkleiden",
        "TAL_23": "Willenskraft",
        # Naturtalente
        "TAL_24": "Faehrtensuchen",
        "TAL_25": "Fesseln & Entfesseln",
        "TAL_26": "Fischen & Angeln",
        "TAL_27": "Orientierung",
        "TAL_28": "Pflanzenkunde",
        "TAL_29": "Tierkunde",
        "TAL_30": "Wildnisleben",
        # Wissenstalente
        "TAL_31": "Brett- & Gluecksspiel",
        "TAL_32": "Geographie",
        "TAL_33": "Geschichtswissen",
        "TAL_34": "Goetter & Kulte",
        "TAL_35": "Kriegskunst",
        "TAL_36": "Magiekunde",
        "TAL_37": "Mechanik",
        "TAL_38": "Rechnen",
        "TAL_39": "Rechtskunde",
        "TAL_40": "Sagen & Legenden",
        "TAL_41": "Sphaerenkunde",
        "TAL_42": "Sternkunde",
        # Handwerkstalente
        "TAL_43": "Alchimie",
        "TAL_44": "Boote & Schiffe",
        "TAL_45": "Fahrzeuge",
        "TAL_46": "Handel",
        "TAL_47": "Heilkunde Gift",
        "TAL_48": "Heilkunde Krankheiten",
        "TAL_49": "Heilkunde Seele",
        "TAL_50": "Heilkunde Wunden",
        "TAL_51": "Holzbearbeitung",
        "TAL_52": "Lebensmittelbearbeitung",
        "TAL_53": "Lederbearbeitung",
        "TAL_54": "Malen & Zeichnen",
        "TAL_55": "Metallbearbeitung",
        "TAL_56": "Musizieren",
        "TAL_57": "Schloesserknacken",
        "TAL_58": "Steinbearbeitung",
        "TAL_59": "Stoffbearbeitung",
    }

    COMBAT_TECHNIQUE_MAP: dict[str, str] = {
        "CT_1": "Armbrueste",
        "CT_2": "Boegen",
        "CT_3": "Dolche",
        "CT_4": "Fechtwaffen",
        "CT_5": "Hiebwaffen",
        "CT_6": "Kettenwaffen",
        "CT_7": "Lanzen",
        "CT_8": "Raufen",
        "CT_9": "Schilde",
        "CT_10": "Schwerter",
        "CT_11": "Stangenwaffen",
        "CT_12": "Wurfwaffen",
        "CT_13": "Zweihandhiebwaffen",
        "CT_14": "Zweihandschwerter",
    }

    # Ranged combat techniques (use FF for AT, no PA)
    RANGED_TECHNIQUES: set[str] = {"Armbrueste", "Boegen", "Wurfwaffen"}

    EXPERIENCE_GRADE_MAP: dict[str, str] = {
        "EL_1": "Unerfahren",
        "EL_2": "Durchschnittlich",
        "EL_3": "Erfahren",
        "EL_4": "Kompetent",
        "EL_5": "Meisterlich",
        "EL_6": "Brillant",
        "EL_7": "Legendaer",
    }

    # Activatable category prefixes for classification
    ADVANTAGE_PREFIX = "ADV_"
    DISADVANTAGE_PREFIX = "DISADV_"
    SPECIAL_ABILITY_PREFIX = "SA_"
    COMBAT_SA_PREFIX = "SA_"

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    def parse(self, json_data: dict) -> dict:
        """Parse Optolith JSON into internal character format.

        Handles both bare character objects and wrapper objects with a "hero" key
        (as produced by some Optolith versions).

        Args:
            json_data: Raw parsed Optolith JSON export.

        Returns:
            A dict matching the Character model fields used in the
            ``CharacterCreate`` schema.
        """
        # Some Optolith versions wrap the data in a "hero" envelope
        hero = json_data.get("hero", json_data)

        name = hero.get("name", "Importierter Charakter")
        species_id = hero.get("r", "")
        species = self.SPECIES_MAP.get(species_id, species_id)
        culture_id = hero.get("c", "")
        culture = self.CULTURE_MAP.get(culture_id, culture_id)
        profession_id = hero.get("p", "")
        # Optolith may store profession name in "professionName" or use ID
        profession = hero.get("professionName", profession_id)
        el_id = hero.get("el", "")
        experience_grade = self.EXPERIENCE_GRADE_MAP.get(el_id, el_id)

        # AP
        ap_data = hero.get("ap", {})
        if isinstance(ap_data, dict):
            total_ap = ap_data.get("total", 0)
            spent_ap = ap_data.get("spent", 0)
            available_ap = total_ap - spent_ap
        else:
            total_ap = 0
            available_ap = 0

        # Core data blocks
        attributes = self._parse_attributes(hero.get("attr", []))
        talents = self._parse_talents(hero.get("talents", {}))
        combat_techniques = self._parse_combat_techniques(hero.get("ct", {}))
        spells = self._parse_spells(hero.get("spells", {}))
        liturgies = self._parse_liturgies(hero.get("liturgies", {}))
        cantrips = self._parse_cantrips(hero.get("cantrips", []))
        blessings = self._parse_blessings(hero.get("blessings", []))
        activatable = hero.get("activatable", {})
        advantages, disadvantages, special_abilities = self._parse_activatables(
            activatable
        )
        inventory, purse = self._parse_inventory(hero.get("belongings", {}))

        derived_values = self._calculate_derived_values(
            attributes=attributes,
            combat_techniques=combat_techniques,
            special_abilities=special_abilities,
            species=species,
            hero=hero,
        )

        # Merge cantrips into spells and blessings into liturgies as flag entries
        if cantrips:
            spells["_cantrips"] = cantrips
        if blessings:
            liturgies["_blessings"] = blessings

        # Build basis_inventory from purse
        basis_inventory: dict[str, Any] = {}
        if purse:
            basis_inventory["purse"] = purse
        if inventory:
            basis_inventory["items"] = inventory

        # Build combat_values from combat techniques
        combat_values = self._build_combat_values(
            attributes, combat_techniques
        )

        # Personal data
        bio_parts: list[str] = []
        pers = hero.get("pers", {})
        if isinstance(pers, dict):
            for field in ("title", "family", "placeOfBirth", "dateOfBirth",
                          "hairColor", "eyeColor", "size", "weight"):
                val = pers.get(field)
                if val:
                    bio_parts.append(f"{field}: {val}")
        bio = "\n".join(bio_parts) if bio_parts else None

        return {
            "name": name,
            "species": species,
            "profession": profession,
            "culture": culture,
            "experience_grade": experience_grade.lower() if experience_grade else None,
            "total_ap": total_ap,
            "available_ap": max(available_ap, 0),
            "attributes": attributes,
            "derived_values": derived_values,
            "combat_values": combat_values,
            "talents": talents,
            "spells": spells if spells else None,
            "liturgies": liturgies if liturgies else None,
            "special_abilities": special_abilities if special_abilities else None,
            "advantages": advantages if advantages else None,
            "disadvantages": disadvantages if disadvantages else None,
            "basis_inventory": basis_inventory if basis_inventory else None,
            "bio": bio,
        }

    def validate(self, character_data: dict) -> dict:
        """Validate parsed character data against DSA5 rules.

        Returns:
            dict with keys:
                valid (bool): Whether the character passes all checks.
                warnings (list[str]): Non-fatal issues found.
                errors (list[str]): Fatal issues that should prevent import.
        """
        warnings: list[str] = []
        errors: list[str] = []

        # Name required
        if not character_data.get("name"):
            errors.append("Character name is missing.")

        # Attributes present and in valid range
        attributes = character_data.get("attributes", {})
        expected_attrs = {"MU", "KL", "IN", "CH", "FF", "GE", "KO", "KK"}
        missing_attrs = expected_attrs - set(attributes.keys())
        if missing_attrs:
            warnings.append(
                f"Missing attributes: {', '.join(sorted(missing_attrs))}. "
                f"Defaults (8) will be used."
            )

        for attr_name, value in attributes.items():
            if attr_name not in expected_attrs:
                warnings.append(f"Unknown attribute '{attr_name}' found.")
            elif not isinstance(value, (int, float)):
                errors.append(f"Attribute '{attr_name}' has non-numeric value: {value}")
            elif value < 1 or value > 25:
                warnings.append(
                    f"Attribute '{attr_name}' has unusual value {value} "
                    f"(expected 1-25)."
                )

        # AP validation
        total_ap = character_data.get("total_ap", 0)
        available_ap = character_data.get("available_ap", 0)
        if total_ap < 0:
            errors.append(f"Total AP is negative: {total_ap}")
        if available_ap < 0:
            warnings.append(f"Available AP is negative: {available_ap}")
        if available_ap > total_ap:
            warnings.append(
                f"Available AP ({available_ap}) exceeds total AP ({total_ap})."
            )

        # Talent values in valid range
        talents = character_data.get("talents", {})
        for talent_name, fw in talents.items():
            if isinstance(fw, (int, float)) and (fw < 0 or fw > 25):
                warnings.append(
                    f"Talent '{talent_name}' has unusual FW {fw} (expected 0-25)."
                )

        # Combat technique values
        combat_values = character_data.get("combat_values", {})
        if isinstance(combat_values, dict):
            for ct_name, ct_data in combat_values.items():
                if isinstance(ct_data, dict):
                    ktw = ct_data.get("ktw", 0)
                    if isinstance(ktw, (int, float)) and (ktw < 6 or ktw > 25):
                        warnings.append(
                            f"Combat technique '{ct_name}' has unusual KtW {ktw} "
                            f"(expected 6-25)."
                        )

        # Derived values sanity check
        derived = character_data.get("derived_values", {})
        if derived:
            max_lep = derived.get("max_lep", 0)
            if isinstance(max_lep, (int, float)) and max_lep < 1:
                errors.append(f"Max LeP is {max_lep}, character would be dead.")

        return {
            "valid": len(errors) == 0,
            "warnings": warnings,
            "errors": errors,
        }

    # -----------------------------------------------------------------------
    # Private parsing helpers
    # -----------------------------------------------------------------------

    def _parse_attributes(self, attr_data: Any) -> dict[str, int]:
        """Parse attribute array to {MU: 14, KL: 15, ...}.

        Optolith stores attributes as a list of {id, value} objects or
        sometimes as a dict keyed by ATTR_x.
        """
        attributes: dict[str, int] = {}

        if isinstance(attr_data, list):
            for entry in attr_data:
                if isinstance(entry, dict):
                    attr_id = entry.get("id", "")
                    value = entry.get("value", 8)
                    readable = self.ATTRIBUTE_MAP.get(attr_id, attr_id)
                    attributes[readable] = int(value) if isinstance(value, (int, float)) else 8
        elif isinstance(attr_data, dict):
            # Some versions use dict format {ATTR_1: {value: 14}, ...}
            # or {"values": [...]}
            values = attr_data.get("values", [])
            if isinstance(values, list):
                return self._parse_attributes(values)
            for attr_id, val_or_obj in attr_data.items():
                readable = self.ATTRIBUTE_MAP.get(attr_id, attr_id)
                if isinstance(val_or_obj, dict):
                    attributes[readable] = int(val_or_obj.get("value", 8))
                elif isinstance(val_or_obj, (int, float)):
                    attributes[readable] = int(val_or_obj)

        # Ensure all 8 attributes are present with defaults
        for attr_id, readable in self.ATTRIBUTE_MAP.items():
            if readable not in attributes:
                attributes[readable] = 8

        return attributes

    def _parse_talents(self, talent_data: Any) -> dict[str, int]:
        """Parse talent data to {talent_name: fw}.

        Optolith stores talents as {TAL_x: fw} where fw is the
        Fertigkeitswert (skill value).
        """
        talents: dict[str, int] = {}

        if not isinstance(talent_data, dict):
            return talents

        for talent_id, fw in talent_data.items():
            name = self.TALENT_MAP.get(talent_id, talent_id)
            if isinstance(fw, (int, float)):
                talents[name] = int(fw)
            elif isinstance(fw, dict):
                # Some formats: {TAL_x: {value: 8}}
                talents[name] = int(fw.get("value", 0))
            else:
                log.warning("Unexpected talent value for %s: %r", talent_id, fw)

        return talents

    def _parse_combat_techniques(self, ct_data: Any) -> dict[str, int]:
        """Parse combat technique values to {technique_name: ktw}.

        Default value for all combat techniques is 6 in DSA5.
        Only elevated values are stored in the export.
        """
        techniques: dict[str, int] = {}

        if not isinstance(ct_data, dict):
            return techniques

        for ct_id, ktw in ct_data.items():
            name = self.COMBAT_TECHNIQUE_MAP.get(ct_id, ct_id)
            if isinstance(ktw, (int, float)):
                techniques[name] = int(ktw)
            elif isinstance(ktw, dict):
                techniques[name] = int(ktw.get("value", 6))
            else:
                log.warning("Unexpected CT value for %s: %r", ct_id, ktw)

        return techniques

    def _parse_spells(self, spell_data: Any) -> dict[str, Any]:
        """Parse spells with their values.

        Returns {spell_id: fw} or {spell_id: {fw, tradition, ...}} depending
        on available data.
        """
        spells: dict[str, Any] = {}

        if not isinstance(spell_data, dict):
            return spells

        for spell_id, value in spell_data.items():
            if isinstance(value, (int, float)):
                spells[spell_id] = int(value)
            elif isinstance(value, dict):
                spells[spell_id] = {
                    "fw": int(value.get("value", value.get("fw", 0))),
                }
                # Preserve any extra info
                if "tradition" in value:
                    spells[spell_id]["tradition"] = value["tradition"]
            else:
                log.warning("Unexpected spell value for %s: %r", spell_id, value)

        return spells

    def _parse_liturgies(self, liturgy_data: Any) -> dict[str, Any]:
        """Parse liturgies with their values."""
        liturgies: dict[str, Any] = {}

        if not isinstance(liturgy_data, dict):
            return liturgies

        for lit_id, value in liturgy_data.items():
            if isinstance(value, (int, float)):
                liturgies[lit_id] = int(value)
            elif isinstance(value, dict):
                liturgies[lit_id] = {
                    "fw": int(value.get("value", value.get("fw", 0))),
                }
                if "tradition" in value:
                    liturgies[lit_id]["tradition"] = value["tradition"]
            else:
                log.warning("Unexpected liturgy value for %s: %r", lit_id, value)

        return liturgies

    def _parse_cantrips(self, cantrip_data: Any) -> list[str]:
        """Parse cantrips (Zaubertricks) - simple list of IDs."""
        if isinstance(cantrip_data, list):
            return [str(c) for c in cantrip_data]
        return []

    def _parse_blessings(self, blessing_data: Any) -> list[str]:
        """Parse blessings (Segnungen) - simple list of IDs."""
        if isinstance(blessing_data, list):
            return [str(b) for b in blessing_data]
        return []

    def _parse_activatables(
        self, activatable_data: Any
    ) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
        """Parse activatable entries (advantages, disadvantages, special abilities).

        Optolith stores all activatables in a single dict keyed by ID.
        Each value is a list of activation instances (for abilities that
        can be taken multiple times or with options).

        Returns:
            (advantages, disadvantages, special_abilities) tuple.
        """
        advantages: dict[str, Any] = {}
        disadvantages: dict[str, Any] = {}
        special_abilities: list[dict[str, Any]] = []

        if not isinstance(activatable_data, dict):
            return advantages, disadvantages, special_abilities

        for act_id, instances in activatable_data.items():
            if not isinstance(instances, list):
                instances = [instances] if instances else []

            for instance in instances:
                entry = self._build_activatable_entry(act_id, instance)

                if act_id.startswith(self.ADVANTAGE_PREFIX):
                    advantages[act_id] = entry
                elif act_id.startswith(self.DISADVANTAGE_PREFIX):
                    disadvantages[act_id] = entry
                else:
                    # Special abilities, combat SAs, magical SAs, etc.
                    special_abilities.append(entry)

        return advantages, disadvantages, special_abilities

    def _build_activatable_entry(
        self, act_id: str, instance: Any
    ) -> dict[str, Any]:
        """Build a structured entry from an activatable instance."""
        entry: dict[str, Any] = {"id": act_id}

        if isinstance(instance, dict):
            # Preserve sid (selection ID), sid2, tier, etc.
            if "sid" in instance:
                entry["option"] = instance["sid"]
            if "sid2" in instance:
                entry["option2"] = instance["sid2"]
            if "tier" in instance:
                entry["tier"] = instance["tier"]
            if "cost" in instance:
                entry["cost"] = instance["cost"]
        elif isinstance(instance, (int, float)):
            entry["tier"] = int(instance)

        return entry

    def _parse_inventory(
        self, belongings_data: Any
    ) -> tuple[list[dict[str, Any]], dict[str, int]]:
        """Parse items and money from the belongings block.

        Returns:
            (items_list, purse_dict) where purse_dict has keys
            dukaten, silber, heller, kreuzer.
        """
        items: list[dict[str, Any]] = []
        purse: dict[str, int] = {
            "dukaten": 0,
            "silber": 0,
            "heller": 0,
            "kreuzer": 0,
        }

        if not isinstance(belongings_data, dict):
            return items, purse

        # Parse purse
        purse_data = belongings_data.get("purse", {})
        if isinstance(purse_data, dict):
            purse["dukaten"] = int(purse_data.get("d", 0))
            purse["silber"] = int(purse_data.get("s", 0))
            purse["heller"] = int(purse_data.get("h", 0))
            purse["kreuzer"] = int(purse_data.get("k", 0))

        # Parse items
        items_data = belongings_data.get("items", {})
        if isinstance(items_data, dict):
            for item_id, item_obj in items_data.items():
                if not isinstance(item_obj, dict):
                    continue
                item_entry: dict[str, Any] = {
                    "id": item_id,
                    "name": item_obj.get("name", item_id),
                    "quantity": int(item_obj.get("amount", item_obj.get("quantity", 1))),
                }
                # Preserve equipment-relevant fields
                if "gr" in item_obj:
                    item_entry["group"] = item_obj["gr"]
                if "where" in item_obj:
                    item_entry["where"] = item_obj["where"]
                if "template" in item_obj:
                    item_entry["template_id"] = item_obj["template"]
                if "isTemplateLocked" in item_obj:
                    item_entry["template_locked"] = item_obj["isTemplateLocked"]
                # Weapon/armor specific fields
                for field in ("combatTechnique", "damageDiceNumber",
                              "damageFlat", "at", "pa", "reach", "length",
                              "pro", "enc", "price", "weight"):
                    if field in item_obj:
                        item_entry[field] = item_obj[field]

                items.append(item_entry)

        return items, purse

    def _calculate_derived_values(
        self,
        attributes: dict[str, int],
        combat_techniques: dict[str, int],
        special_abilities: list[dict[str, Any]],
        species: str,
        hero: dict,
    ) -> dict[str, Any]:
        """Calculate derived values (LeP, AsP, GS, INI, AW, SK, ZK, etc.).

        Uses DSA5 formulas:
        - LeP_max = species_base + 2 * KO + purchased_LeP
        - AsP_max = base + Leiteigenschaft + purchased_AsP (if magical)
        - KaP_max = base + MU + purchased_KaP (if blessed)
        - INI_basis = (MU + GE) / 2 (rounded down)
        - GS = species_base (8 for Mensch, 6 for Zwerg)
        - AW = GE / 2 (rounded down)
        - SK = (MU + KL + IN) / 6 (rounded down)
        - ZK = (KO + KO + KK) / 6 (rounded down)
        - Schip = species_base
        """
        mu = attributes.get("MU", 8)
        kl = attributes.get("KL", 8)
        in_ = attributes.get("IN", 8)
        ch = attributes.get("CH", 8)
        ge = attributes.get("GE", 8)
        ko = attributes.get("KO", 8)
        kk = attributes.get("KK", 8)

        # Species-based values
        lep_basis = self.SPECIES_LEP_BASE.get(species, 5)
        gs = self.SPECIES_GS_BASE.get(species, 8)
        schip = self.SPECIES_SCHIP_BASE.get(species, 3)

        # Attempt to read purchased LeP/AsP/KaP from activatables
        lep_gekauft = self._get_purchased_energy(hero, "ADV_25")  # Hohe Lebenskraft
        lep_lost = self._get_purchased_energy(hero, "DISADV_27")  # Niedrige Lebenskraft
        asp_gekauft = self._get_purchased_energy(hero, "ADV_23")  # Hohe Astralkraft
        kap_gekauft = self._get_purchased_energy(hero, "ADV_24")  # Hohes Karma

        derived: dict[str, Any] = {
            "max_lep": lep_basis + 2 * ko + lep_gekauft - lep_lost,
            "ini_basis": (mu + ge) // 2,
            "gs": gs,
            "aw": ge // 2,
            "sk": (mu + kl + in_) // 6,
            "zk": (ko + ko + kk) // 6,
            "schip": schip,
        }

        # Detect magical tradition (has spells or relevant advantage)
        has_spells = bool(hero.get("spells")) or bool(hero.get("cantrips"))
        if has_spells:
            # Default Leiteigenschaft is CH for most traditions
            le_attr = ch
            derived["max_asp"] = 20 + le_attr + asp_gekauft

        # Detect blessed tradition (has liturgies or relevant advantage)
        has_liturgies = bool(hero.get("liturgies")) or bool(hero.get("blessings"))
        if has_liturgies:
            derived["max_kap"] = 20 + mu + kap_gekauft

        return derived

    def _get_purchased_energy(self, hero: dict, advantage_id: str) -> int:
        """Extract the tier/level of a purchased energy advantage/disadvantage."""
        activatable = hero.get("activatable", {})
        if not isinstance(activatable, dict):
            return 0

        instances = activatable.get(advantage_id, [])
        if not isinstance(instances, list):
            instances = [instances] if instances else []

        total = 0
        for inst in instances:
            if isinstance(inst, dict):
                total += int(inst.get("tier", 0))
            elif isinstance(inst, (int, float)):
                total += int(inst)
        return total

    def _build_combat_values(
        self,
        attributes: dict[str, int],
        combat_techniques: dict[str, int],
    ) -> dict[str, Any]:
        """Build combat_values dict with AT/PA per combat technique.

        DSA5 rules:
        - Melee AT = KtW + (MU - 8) for most, ceiling = KtW
          Actually: AT = ceil(KtW / 2) + MU-Mod (depending on technique)
          Simplified: AT_basis = (MU + GE) / 2 for base, then technique adds
        - The KtW is the total skill value. AT and PA split from it.
        - For melee: AT = ceil(KtW/2), PA = floor(KtW/2) + bonus
        - For ranged: AT = KtW (no PA)
        """
        mu = attributes.get("MU", 8)
        ge = attributes.get("GE", 8)
        kk = attributes.get("KK", 8)
        ff = attributes.get("FF", 8)

        values: dict[str, Any] = {}

        for tech_name, ktw in combat_techniques.items():
            if tech_name in self.RANGED_TECHNIQUES:
                # Ranged: AT based on FF
                at = ktw  # Simplified: full KtW for ranged AT
                values[tech_name] = {"ktw": ktw, "at": at}
            else:
                # Melee: split KtW into AT and PA
                at = math.ceil(ktw / 2)
                pa = ktw // 2
                values[tech_name] = {"ktw": ktw, "at": at, "pa": pa}

        return values


def detect_format(json_data: dict) -> str:
    """Auto-detect if JSON is Optolith or DSA Ultimate format.

    Checks for format-specific keys to determine the source tool.

    Returns:
        'optolith' if the data matches Optolith's export structure,
        'dsa_ultimate' if it matches DSA Ultimate's structure,
        'unknown' if neither format is recognized.
    """
    if not isinstance(json_data, dict):
        return "unknown"

    # Optolith markers: uses coded IDs and specific top-level keys
    optolith_keys = {"clientVersion", "el", "attr", "activatable", "ct"}
    # Also check for hero wrapper (some Optolith versions)
    hero_wrapper_keys = {"hero", "clientVersion"}

    # DSA Ultimate markers: uses German names directly
    dsa_ultimate_keys = {"eigenschaften", "rasse", "talente", "kampftechniken"}
    # Alternative DSA Ultimate structure with wrapper
    dsa_ultimate_alt_keys = {"character", "system"}

    # Count matching keys
    optolith_score = len(optolith_keys & set(json_data.keys()))
    dsa_ultimate_score = len(dsa_ultimate_keys & set(json_data.keys()))

    # Check for hero wrapper
    if "hero" in json_data and isinstance(json_data.get("hero"), dict):
        hero = json_data["hero"]
        optolith_score += len(optolith_keys & set(hero.keys()))

    # Check for DSA Ultimate alt structure
    if dsa_ultimate_alt_keys <= set(json_data.keys()):
        dsa_ultimate_score += 3

    # Decisive checks
    if "clientVersion" in json_data:
        return "optolith"
    if "eigenschaften" in json_data and "rasse" in json_data:
        return "dsa_ultimate"

    # Scoring fallback
    if optolith_score >= 2:
        return "optolith"
    if dsa_ultimate_score >= 2:
        return "dsa_ultimate"

    # Additional heuristics
    if "attr" in json_data and isinstance(json_data.get("attr"), (list, dict)):
        return "optolith"
    if "talente" in json_data and isinstance(json_data.get("talente"), dict):
        return "dsa_ultimate"

    return "unknown"

"""Parser for DSA Ultimate character JSON exports.

DSA Ultimate is a mobile app for DSA5 character management. Its export format
uses German names directly (unlike Optolith's coded IDs), making parsing more
straightforward.

DSA Ultimate exports with this structure:
{
    "name": "Character Name",
    "rasse": "Mensch",
    "kultur": "Mittelreich",
    "profession": "Krieger",
    "erfahrungsgrad": "Erfahren",
    "ap_gesamt": 1100,
    "ap_ausgegeben": 1025,
    "eigenschaften": {
        "MU": 14, "KL": 15, "IN": 14, "CH": 13,
        "FF": 12, "GE": 13, "KO": 10, "KK": 9
    },
    "talente": {
        "Klettern": 8,
        "Koerperbeherrschung": 10,
        ...
    },
    "kampftechniken": {
        "Schwerter": 12,
        "Dolche": 8,
        ...
    },
    "zauber": {...},
    "liturgien": {...},
    "sonderfertigkeiten": [...],
    "vorteile": [...],
    "nachteile": [...],
    "ausruestung": [...],
    "geld": {"dukaten": 0, "silber": 47, "heller": 5, "kreuzer": 0}
}
"""

from __future__ import annotations

import logging
import math
from typing import Any, Optional

log = logging.getLogger("importers.dsa_ultimate")


class DSAUltimateImporter:
    """Parses DSA Ultimate JSON exports into the internal AventuriaVTT character format."""

    # Valid attribute names
    VALID_ATTRIBUTES: set[str] = {"MU", "KL", "IN", "CH", "FF", "GE", "KO", "KK"}

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

    # Ranged combat techniques (AT only, no PA)
    RANGED_TECHNIQUES: set[str] = {
        "Armbrueste", "Boegen", "Wurfwaffen",
        "Armbrüste", "Bögen",  # Accept umlaut variants too
    }

    # Map experience grade names to lowercase internal format
    EXPERIENCE_GRADE_NORMALIZE: dict[str, str] = {
        "unerfahren": "unerfahren",
        "durchschnittlich": "durchschnittlich",
        "erfahren": "erfahren",
        "kompetent": "kompetent",
        "meisterlich": "meisterlich",
        "brillant": "brillant",
        "legendär": "legendaer",
        "legendaer": "legendaer",
    }

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    def parse(self, json_data: dict) -> dict:
        """Parse DSA Ultimate JSON into internal character format.

        Handles both bare character objects and wrapper objects with a
        "character" key.

        Args:
            json_data: Raw parsed DSA Ultimate JSON export.

        Returns:
            A dict matching the Character model fields used in the
            ``CharacterCreate`` schema.
        """
        # Some exports wrap data in a "character" envelope
        data = json_data.get("character", json_data) if "character" in json_data else json_data

        name = data.get("name", "Importierter Charakter")
        species = data.get("rasse", data.get("spezies", data.get("species", "")))
        culture = data.get("kultur", data.get("culture", ""))
        profession = data.get("profession", "")
        experience_grade_raw = data.get(
            "erfahrungsgrad",
            data.get("experience_grade", ""),
        )
        experience_grade = self.EXPERIENCE_GRADE_NORMALIZE.get(
            experience_grade_raw.lower() if experience_grade_raw else "",
            experience_grade_raw.lower() if experience_grade_raw else None,
        )

        # AP
        total_ap = int(data.get("ap_gesamt", data.get("total_ap", 0)))
        ap_spent = int(data.get("ap_ausgegeben", data.get("ap_spent", 0)))
        available_ap = total_ap - ap_spent

        # Core data blocks
        attributes = self._parse_attributes(
            data.get("eigenschaften", data.get("attributes", {}))
        )
        talents = self._parse_talents(
            data.get("talente", data.get("talents", {}))
        )
        combat_techniques = self._parse_combat_techniques(
            data.get("kampftechniken", data.get("combat_techniques", {}))
        )
        spells = self._parse_spells(
            data.get("zauber", data.get("spells", {}))
        )
        liturgies = self._parse_liturgies(
            data.get("liturgien", data.get("liturgies", {}))
        )

        advantages, disadvantages, special_abilities = self._parse_special_abilities(
            sonderfertigkeiten=data.get("sonderfertigkeiten", data.get("special_abilities", [])),
            vorteile=data.get("vorteile", data.get("advantages", [])),
            nachteile=data.get("nachteile", data.get("disadvantages", [])),
        )

        inventory, purse = self._parse_inventory(
            ausruestung=data.get("ausruestung", data.get("ausrüstung", data.get("equipment", []))),
            geld=data.get("geld", data.get("money", {})),
        )

        derived_values = self._calculate_derived_values(
            attributes=attributes,
            combat_techniques=combat_techniques,
            special_abilities=special_abilities,
            species=species,
            data=data,
        )

        # Build basis_inventory
        basis_inventory: dict[str, Any] = {}
        if purse:
            basis_inventory["purse"] = purse
        if inventory:
            basis_inventory["items"] = inventory

        # Build combat_values
        combat_values = self._build_combat_values(
            attributes, combat_techniques
        )

        # Bio from personal data fields
        bio_parts: list[str] = []
        persoenlich = data.get("persoenliche_daten", data.get("personal_data", {}))
        if isinstance(persoenlich, dict):
            for field in ("titel", "familie", "geburtsort", "geburtsdatum",
                          "haarfarbe", "augenfarbe", "groesse", "gewicht"):
                val = persoenlich.get(field)
                if val:
                    bio_parts.append(f"{field}: {val}")
        bio = "\n".join(bio_parts) if bio_parts else None

        return {
            "name": name,
            "species": species if species else None,
            "profession": profession if profession else None,
            "culture": culture if culture else None,
            "experience_grade": experience_grade,
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
        missing_attrs = self.VALID_ATTRIBUTES - set(attributes.keys())
        if missing_attrs:
            warnings.append(
                f"Missing attributes: {', '.join(sorted(missing_attrs))}. "
                f"Defaults (8) will be used."
            )

        for attr_name, value in attributes.items():
            if attr_name not in self.VALID_ATTRIBUTES:
                warnings.append(f"Unknown attribute '{attr_name}' found.")
            elif not isinstance(value, (int, float)):
                errors.append(
                    f"Attribute '{attr_name}' has non-numeric value: {value}"
                )
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

        # Species validation
        species = character_data.get("species", "")
        known_species = {"Mensch", "Elf", "Halbelf", "Zwerg"}
        if species and species not in known_species:
            warnings.append(
                f"Unknown species '{species}'. Known: {', '.join(sorted(known_species))}."
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

    def _parse_attributes(self, eigenschaften: Any) -> dict[str, int]:
        """Parse attribute dict to {MU: 14, KL: 15, ...}.

        DSA Ultimate stores attributes directly as {MU: 14, KL: 15, ...}.
        """
        attributes: dict[str, int] = {}

        if isinstance(eigenschaften, dict):
            for attr_name, value in eigenschaften.items():
                name = attr_name.upper().strip()
                if isinstance(value, (int, float)):
                    attributes[name] = int(value)
                elif isinstance(value, dict):
                    attributes[name] = int(value.get("wert", value.get("value", 8)))
                else:
                    log.warning("Unexpected attribute value for %s: %r", attr_name, value)
        elif isinstance(eigenschaften, list):
            # Some exports use a list of {name, wert} objects
            for entry in eigenschaften:
                if isinstance(entry, dict):
                    name = entry.get("name", entry.get("id", "")).upper().strip()
                    value = entry.get("wert", entry.get("value", 8))
                    attributes[name] = int(value) if isinstance(value, (int, float)) else 8

        # Ensure all 8 attributes are present
        for attr in self.VALID_ATTRIBUTES:
            if attr not in attributes:
                attributes[attr] = 8

        return attributes

    def _parse_talents(self, talente: Any) -> dict[str, int]:
        """Parse talent data to {talent_name: fw}.

        DSA Ultimate stores talents as {name: fw} or as a list of objects.
        """
        talents: dict[str, int] = {}

        if isinstance(talente, dict):
            for talent_name, fw in talente.items():
                if isinstance(fw, (int, float)):
                    talents[talent_name] = int(fw)
                elif isinstance(fw, dict):
                    talents[talent_name] = int(fw.get("fw", fw.get("wert", fw.get("value", 0))))
                else:
                    log.warning("Unexpected talent value for %s: %r", talent_name, fw)
        elif isinstance(talente, list):
            for entry in talente:
                if isinstance(entry, dict):
                    name = entry.get("name", entry.get("id", ""))
                    fw = entry.get("fw", entry.get("wert", entry.get("value", 0)))
                    if name:
                        talents[name] = int(fw) if isinstance(fw, (int, float)) else 0

        return talents

    def _parse_combat_techniques(self, kampftechniken: Any) -> dict[str, int]:
        """Parse combat technique values to {technique_name: ktw}."""
        techniques: dict[str, int] = {}

        if isinstance(kampftechniken, dict):
            for ct_name, ktw in kampftechniken.items():
                if isinstance(ktw, (int, float)):
                    techniques[ct_name] = int(ktw)
                elif isinstance(ktw, dict):
                    techniques[ct_name] = int(ktw.get("ktw", ktw.get("wert", ktw.get("value", 6))))
                else:
                    log.warning("Unexpected CT value for %s: %r", ct_name, ktw)
        elif isinstance(kampftechniken, list):
            for entry in kampftechniken:
                if isinstance(entry, dict):
                    name = entry.get("name", entry.get("id", ""))
                    ktw = entry.get("ktw", entry.get("wert", entry.get("value", 6)))
                    if name:
                        techniques[name] = int(ktw) if isinstance(ktw, (int, float)) else 6

        return techniques

    def _parse_spells(self, zauber: Any) -> dict[str, Any]:
        """Parse spells with their values."""
        spells: dict[str, Any] = {}

        if isinstance(zauber, dict):
            for spell_name, value in zauber.items():
                if isinstance(value, (int, float)):
                    spells[spell_name] = int(value)
                elif isinstance(value, dict):
                    spells[spell_name] = {
                        "fw": int(value.get("fw", value.get("wert", value.get("value", 0)))),
                    }
                    if "tradition" in value:
                        spells[spell_name]["tradition"] = value["tradition"]
                else:
                    log.warning("Unexpected spell value for %s: %r", spell_name, value)
        elif isinstance(zauber, list):
            for entry in zauber:
                if isinstance(entry, dict):
                    name = entry.get("name", entry.get("id", ""))
                    fw = entry.get("fw", entry.get("wert", entry.get("value", 0)))
                    if name:
                        spells[name] = int(fw) if isinstance(fw, (int, float)) else 0

        return spells

    def _parse_liturgies(self, liturgien: Any) -> dict[str, Any]:
        """Parse liturgies with their values."""
        liturgies: dict[str, Any] = {}

        if isinstance(liturgien, dict):
            for lit_name, value in liturgien.items():
                if isinstance(value, (int, float)):
                    liturgies[lit_name] = int(value)
                elif isinstance(value, dict):
                    liturgies[lit_name] = {
                        "fw": int(value.get("fw", value.get("wert", value.get("value", 0)))),
                    }
                    if "tradition" in value:
                        liturgies[lit_name]["tradition"] = value["tradition"]
                else:
                    log.warning("Unexpected liturgy value for %s: %r", lit_name, value)
        elif isinstance(liturgien, list):
            for entry in liturgien:
                if isinstance(entry, dict):
                    name = entry.get("name", entry.get("id", ""))
                    fw = entry.get("fw", entry.get("wert", entry.get("value", 0)))
                    if name:
                        liturgies[name] = int(fw) if isinstance(fw, (int, float)) else 0

        return liturgies

    def _parse_special_abilities(
        self,
        sonderfertigkeiten: Any,
        vorteile: Any,
        nachteile: Any,
    ) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
        """Parse special abilities, advantages, and disadvantages.

        Returns:
            (advantages, disadvantages, special_abilities) tuple.
        """
        advantages = self._parse_trait_list(vorteile)
        disadvantages = self._parse_trait_list(nachteile)
        special_abilities = self._parse_sa_list(sonderfertigkeiten)

        return advantages, disadvantages, special_abilities

    def _parse_trait_list(self, trait_data: Any) -> dict[str, Any]:
        """Parse a list or dict of advantages/disadvantages into a dict."""
        traits: dict[str, Any] = {}

        if isinstance(trait_data, dict):
            for name, value in trait_data.items():
                if isinstance(value, dict):
                    traits[name] = value
                elif isinstance(value, (int, float)):
                    traits[name] = {"tier": int(value)}
                elif isinstance(value, str):
                    traits[name] = {"option": value}
                elif isinstance(value, bool):
                    traits[name] = {"active": value}
                else:
                    traits[name] = {}
        elif isinstance(trait_data, list):
            for entry in trait_data:
                if isinstance(entry, str):
                    traits[entry] = {}
                elif isinstance(entry, dict):
                    name = entry.get("name", entry.get("id", f"unknown_{len(traits)}"))
                    data = {k: v for k, v in entry.items() if k not in ("name", "id")}
                    traits[name] = data

        return traits

    def _parse_sa_list(self, sa_data: Any) -> list[dict[str, Any]]:
        """Parse special abilities list."""
        abilities: list[dict[str, Any]] = []

        if isinstance(sa_data, list):
            for entry in sa_data:
                if isinstance(entry, str):
                    abilities.append({"id": entry, "name": entry})
                elif isinstance(entry, dict):
                    sa_entry: dict[str, Any] = {
                        "id": entry.get("id", entry.get("name", "")),
                        "name": entry.get("name", entry.get("id", "")),
                    }
                    if "tier" in entry:
                        sa_entry["tier"] = entry["tier"]
                    if "option" in entry:
                        sa_entry["option"] = entry["option"]
                    if "stufe" in entry:
                        sa_entry["tier"] = entry["stufe"]
                    abilities.append(sa_entry)
        elif isinstance(sa_data, dict):
            for name, value in sa_data.items():
                sa_entry = {"id": name, "name": name}
                if isinstance(value, dict):
                    sa_entry.update(value)
                elif isinstance(value, (int, float)):
                    sa_entry["tier"] = int(value)
                abilities.append(sa_entry)

        return abilities

    def _parse_inventory(
        self,
        ausruestung: Any,
        geld: Any,
    ) -> tuple[list[dict[str, Any]], dict[str, int]]:
        """Parse items and money.

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

        # Parse money
        if isinstance(geld, dict):
            purse["dukaten"] = int(geld.get("dukaten", geld.get("d", 0)))
            purse["silber"] = int(geld.get("silber", geld.get("s", 0)))
            purse["heller"] = int(geld.get("heller", geld.get("h", 0)))
            purse["kreuzer"] = int(geld.get("kreuzer", geld.get("k", 0)))

        # Parse equipment
        if isinstance(ausruestung, list):
            for entry in ausruestung:
                if isinstance(entry, str):
                    items.append({"name": entry, "quantity": 1})
                elif isinstance(entry, dict):
                    item: dict[str, Any] = {
                        "name": entry.get("name", entry.get("bezeichnung", "Unbekannt")),
                        "quantity": int(entry.get("anzahl", entry.get("quantity", entry.get("amount", 1)))),
                    }
                    # Preserve useful fields
                    for field in ("gewicht", "weight", "preis", "price",
                                  "kategorie", "category", "notizen", "notes",
                                  "tragend", "equipped", "kampftechnik",
                                  "combat_technique", "schaden", "damage",
                                  "at_mod", "pa_mod", "reichweite", "reach",
                                  "rs", "be"):
                        if field in entry:
                            item[field] = entry[field]
                    items.append(item)
        elif isinstance(ausruestung, dict):
            for item_name, item_data in ausruestung.items():
                item = {"name": item_name, "quantity": 1}
                if isinstance(item_data, dict):
                    item["quantity"] = int(item_data.get("anzahl", item_data.get("quantity", 1)))
                    for field in ("gewicht", "weight", "preis", "price"):
                        if field in item_data:
                            item[field] = item_data[field]
                elif isinstance(item_data, (int, float)):
                    item["quantity"] = int(item_data)
                items.append(item)

        return items, purse

    def _calculate_derived_values(
        self,
        attributes: dict[str, int],
        combat_techniques: dict[str, int],
        special_abilities: list[dict[str, Any]],
        species: str,
        data: dict,
    ) -> dict[str, Any]:
        """Calculate derived values (LeP, AsP, GS, INI, AW, SK, ZK, etc.).

        Uses the same DSA5 formulas as the Optolith importer.
        If the export already contains derived values, those are preferred.
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

        # Check if export already has derived values
        existing_derived = data.get("abgeleitete_werte", data.get("derived_values", {}))

        # Detect purchased energy modifications from advantages/disadvantages
        lep_mod = self._get_energy_mod_from_traits(data, "lep")
        asp_mod = self._get_energy_mod_from_traits(data, "asp")
        kap_mod = self._get_energy_mod_from_traits(data, "kap")

        derived: dict[str, Any] = {
            "max_lep": lep_basis + 2 * ko + lep_mod,
            "ini_basis": (mu + ge) // 2,
            "gs": gs,
            "aw": ge // 2,
            "sk": (mu + kl + in_) // 6,
            "zk": (ko + ko + kk) // 6,
            "schip": schip,
        }

        # Use export values if available and reasonable
        if isinstance(existing_derived, dict):
            for key in ("max_lep", "ini_basis", "gs", "aw", "sk", "zk", "schip",
                         "max_asp", "max_kap"):
                if key in existing_derived and isinstance(existing_derived[key], (int, float)):
                    derived[key] = int(existing_derived[key])

        # Detect magical character
        has_spells = bool(data.get("zauber", data.get("spells")))
        if has_spells and "max_asp" not in derived:
            le_attr = ch  # Default Leiteigenschaft
            derived["max_asp"] = 20 + le_attr + asp_mod

        # Detect blessed character
        has_liturgies = bool(data.get("liturgien", data.get("liturgies")))
        if has_liturgies and "max_kap" not in derived:
            derived["max_kap"] = 20 + mu + kap_mod

        return derived

    def _get_energy_mod_from_traits(self, data: dict, energy_type: str) -> int:
        """Extract energy modifications from advantages/disadvantages.

        Looks for traits like "Hohe Lebenskraft" (positive) and
        "Niedrige Lebenskraft" (negative).
        """
        mod = 0

        vorteile = data.get("vorteile", data.get("advantages", []))
        nachteile = data.get("nachteile", data.get("disadvantages", []))

        positive_names: dict[str, str] = {
            "lep": "Hohe Lebenskraft",
            "asp": "Hohe Astralkraft",
            "kap": "Hohes Karma",
        }
        negative_names: dict[str, str] = {
            "lep": "Niedrige Lebenskraft",
            "asp": "Niedrige Astralkraft",
            "kap": "Niedriges Karma",
        }

        positive_name = positive_names.get(energy_type, "")
        negative_name = negative_names.get(energy_type, "")

        # Check advantages
        mod += self._find_trait_tier(vorteile, positive_name)

        # Check disadvantages (subtractive)
        mod -= self._find_trait_tier(nachteile, negative_name)

        return mod

    def _find_trait_tier(self, trait_data: Any, trait_name: str) -> int:
        """Find the tier/level of a named trait in a list or dict."""
        if not trait_name:
            return 0

        if isinstance(trait_data, list):
            for entry in trait_data:
                if isinstance(entry, str) and entry == trait_name:
                    return 1
                elif isinstance(entry, dict):
                    name = entry.get("name", entry.get("id", ""))
                    if name == trait_name:
                        return int(entry.get("tier", entry.get("stufe", 1)))
        elif isinstance(trait_data, dict):
            if trait_name in trait_data:
                value = trait_data[trait_name]
                if isinstance(value, (int, float)):
                    return int(value)
                elif isinstance(value, dict):
                    return int(value.get("tier", value.get("stufe", 1)))
                return 1

        return 0

    def _build_combat_values(
        self,
        attributes: dict[str, int],
        combat_techniques: dict[str, int],
    ) -> dict[str, Any]:
        """Build combat_values dict with AT/PA per combat technique."""
        values: dict[str, Any] = {}

        for tech_name, ktw in combat_techniques.items():
            # Normalize technique name for ranged check
            is_ranged = tech_name in self.RANGED_TECHNIQUES

            if is_ranged:
                at = ktw
                values[tech_name] = {"ktw": ktw, "at": at}
            else:
                at = math.ceil(ktw / 2)
                pa = ktw // 2
                values[tech_name] = {"ktw": ktw, "at": at, "pa": pa}

        return values

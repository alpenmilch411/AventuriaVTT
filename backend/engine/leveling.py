"""
DSA5 Steigerungssystem (Leveling / AP Spending)

Implementiert die AP-Kostenberechnung, Voraussetzungsprüfung,
Maximalwert-Validierung und abgeleitete Werte-Neuberechnung
gemäß dem DSA5-Regelwerk.

Alle Funktionen sind reine Funktionen ohne Seiteneffekte.
"""

from __future__ import annotations

import copy
import math
from typing import Optional


# Steigerungsfaktor-Kostentabellen
# Schlüssel = aktueller Wert, Wert = AP-Kosten um auf aktueller_wert + 1 zu steigern
STEIGERUNGSFAKTOR: dict[str, dict[int, int]] = {
    "A": {
        0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1,
        8: 2, 9: 2, 10: 2, 11: 2, 12: 2,
        13: 3, 14: 3, 15: 3,
        16: 4, 17: 4,
        18: 5, 19: 6, 20: 7, 21: 8, 22: 9, 23: 10, 24: 12,
    },
    "B": {
        0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2,
        8: 4, 9: 4, 10: 4, 11: 4, 12: 4,
        13: 6, 14: 6, 15: 6,
        16: 8, 17: 8,
        18: 10, 19: 12, 20: 14, 21: 16, 22: 18, 23: 20, 24: 24,
    },
    "C": {
        0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3,
        8: 6, 9: 6, 10: 6, 11: 6, 12: 6,
        13: 9, 14: 9, 15: 9,
        16: 12, 17: 12,
        18: 15, 19: 18, 20: 21, 21: 24, 22: 27, 23: 30, 24: 36,
    },
    "D": {
        0: 4, 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4,
        8: 8, 9: 8, 10: 8, 11: 8, 12: 8,
        13: 12, 14: 12, 15: 12,
        16: 16, 17: 16,
        18: 20, 19: 24, 20: 28, 21: 32, 22: 36, 23: 40, 24: 48,
    },
    "E": {
        0: 5, 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5,
        8: 10, 9: 10, 10: 10, 11: 10, 12: 10,
        13: 15, 14: 15, 15: 15,
        16: 20, 17: 20,
        18: 25, 19: 30, 20: 35, 21: 40, 22: 45, 23: 50, 24: 60,
    },
}

# Eigenschaftssteigerungskosten
# Kosten hängen von der Erfahrungsstufe ab und dem aktuellen Eigenschaftswert
EIGENSCHAFT_COST: dict[int, int] = {
    # Kosten pro Punkt (ab Eigenschaftswert 9)
    8: 15, 9: 15, 10: 15, 11: 15, 12: 15, 13: 15, 14: 15,
    15: 30, 16: 30, 17: 30,
    18: 60, 19: 60,
    20: 120, 21: 120,
    22: 240, 23: 240,
    24: 480,
}

# Erfahrungsgrade und ihre Grenzen
ERFAHRUNGSGRADE: dict[str, dict] = {
    "unerfahren": {
        "ap_range": (0, 899),
        "max_eigenschaft": 14,
        "max_fertigkeit": 14,
        "max_kampftechnik": 14,
        "max_zauber": 14,
        "max_eigenschaft_total_bonus": 0,  # Keine Eigenschaft über Spezies-Max
    },
    "durchschnittlich": {
        "ap_range": (900, 1099),
        "max_eigenschaft": 15,
        "max_fertigkeit": 16,
        "max_kampftechnik": 16,
        "max_zauber": 16,
    },
    "erfahren": {
        "ap_range": (1100, 1199),
        "max_eigenschaft": 16,
        "max_fertigkeit": 18,
        "max_kampftechnik": 18,
        "max_zauber": 18,
    },
    "kompetent": {
        "ap_range": (1200, 1399),
        "max_eigenschaft": 17,
        "max_fertigkeit": 20,
        "max_kampftechnik": 20,
        "max_zauber": 20,
    },
    "meisterlich": {
        "ap_range": (1400, 1699),
        "max_eigenschaft": 18,
        "max_fertigkeit": 22,
        "max_kampftechnik": 22,
        "max_zauber": 22,
    },
    "brillant": {
        "ap_range": (1700, 1999),
        "max_eigenschaft": 19,
        "max_fertigkeit": 24,
        "max_kampftechnik": 24,
        "max_zauber": 24,
    },
    "legendaer": {
        "ap_range": (2000, 99999),
        "max_eigenschaft": 20,
        "max_fertigkeit": 25,
        "max_kampftechnik": 25,
        "max_zauber": 25,
    },
}


def calculate_upgrade_cost(current_value: int, steigerungsfaktor: str) -> int:
    """Berechnet die AP-Kosten um einen Fertigkeitswert von current_value auf current_value + 1 zu steigern.

    Args:
        current_value: Aktueller Fertigkeitswert (0-24).
        steigerungsfaktor: Steigerungsfaktor ('A' bis 'E').

    Returns:
        AP-Kosten für die Steigerung.

    Raises:
        ValueError: Bei ungültigem Steigerungsfaktor oder Wert außerhalb der Tabelle.
    """
    sf = steigerungsfaktor.upper()
    if sf not in STEIGERUNGSFAKTOR:
        raise ValueError(f"Ungültiger Steigerungsfaktor: '{sf}'. Erlaubt: A, B, C, D, E")

    table = STEIGERUNGSFAKTOR[sf]

    if current_value < 0:
        # Aktivierung (von inaktiv auf 0): Kosten wie Wert 0
        return table.get(0, 1) * abs(current_value)

    if current_value in table:
        return table[current_value]

    # Wert über 24: Extrapolation (jeder Punkt über 24 verdoppelt sich)
    if current_value > 24:
        base_cost = table[24]
        extra_levels = current_value - 24
        return base_cost * (2 ** extra_levels)

    raise ValueError(f"Kein Eintrag für Wert {current_value} in Faktor {sf}")


def calculate_eigenschaft_cost(current_value: int) -> int:
    """Berechnet die AP-Kosten um eine Eigenschaft um 1 zu steigern.

    Args:
        current_value: Aktueller Eigenschaftswert.

    Returns:
        AP-Kosten für die Steigerung.
    """
    if current_value in EIGENSCHAFT_COST:
        return EIGENSCHAFT_COST[current_value]

    # Fallback für Werte außerhalb der Tabelle
    if current_value < 8:
        return 15
    if current_value > 24:
        return 480 * (2 ** (current_value - 24))

    return 15


def validate_prerequisites(
    upgrade_type: str,
    upgrade_id: str,
    character_data: dict,
    databank: Optional[dict] = None,
) -> dict:
    """Prüft ob die Voraussetzungen für eine Steigerung erfüllt sind.

    Voraussetzungstypen:
    - Eigenschaft: Mindestwert einer Eigenschaft
    - Fertigkeit: Mindestwert einer Fertigkeit
    - Sonderfertigkeit: Bestimmte SF muss vorhanden sein
    - Vorteil: Bestimmter Vorteil muss vorhanden sein
    - Erfahrungsgrad: Mindest-Erfahrungsgrad

    Args:
        upgrade_type: Art der Steigerung ('fertigkeit', 'kampftechnik', 'zauber',
                      'liturgie', 'sonderfertigkeit', 'eigenschaft').
        upgrade_id: ID der Fertigkeit/SF/etc.
        character_data: Charakterdaten mit eigenschaften, fertigkeiten,
                       sonderfertigkeiten, vorteile, erfahrungsgrad.
        databank: Optionale Regelwerk-Datenbank mit Voraussetzungsdefinitionen.
            Format: {upgrade_id: {prerequisites: [{type, id, min_value}]}}

    Returns:
        dict mit:
            valid (bool): Voraussetzungen erfüllt
            missing (list[str]): Liste fehlender Voraussetzungen
    """
    if databank is None:
        databank = {}

    missing = []

    # Voraussetzungen aus der Datenbank laden
    prerequisites = []
    if upgrade_id in databank:
        prerequisites = databank[upgrade_id].get("prerequisites", [])

    eigenschaften = character_data.get("eigenschaften", {})
    fertigkeiten = character_data.get("fertigkeiten", {})
    sonderfertigkeiten = set(character_data.get("sonderfertigkeiten", []))
    vorteile = set(character_data.get("vorteile", []))

    for prereq in prerequisites:
        prereq_type = prereq.get("type", "")
        prereq_id = prereq.get("id", "")
        min_value = prereq.get("min_value", 0)

        if prereq_type == "eigenschaft":
            current = eigenschaften.get(prereq_id, 8)
            if current < min_value:
                missing.append(f"{prereq_id} mindestens {min_value} (aktuell: {current})")

        elif prereq_type == "fertigkeit":
            current = fertigkeiten.get(prereq_id, {}).get("fw", 0)
            if current < min_value:
                missing.append(f"Fertigkeit '{prereq_id}' mindestens FW {min_value} (aktuell: {current})")

        elif prereq_type == "sonderfertigkeit":
            if prereq_id not in sonderfertigkeiten:
                missing.append(f"Sonderfertigkeit '{prereq_id}' benötigt")

        elif prereq_type == "vorteil":
            if prereq_id not in vorteile:
                missing.append(f"Vorteil '{prereq_id}' benötigt")

        elif prereq_type == "erfahrungsgrad":
            # Prüfe ob der aktuelle Erfahrungsgrad ausreicht
            required_grade = prereq_id
            char_grade = character_data.get("erfahrungsgrad", "durchschnittlich")
            grade_order = list(ERFAHRUNGSGRADE.keys())
            if grade_order.index(char_grade) < grade_order.index(required_grade):
                missing.append(f"Erfahrungsgrad '{required_grade}' benötigt (aktuell: '{char_grade}')")

    return {
        "valid": len(missing) == 0,
        "missing": missing,
    }


def validate_max_value(
    current_value: int,
    experience_grade: str,
    value_type: str,
) -> bool:
    """Prüft ob ein Wert das Maximum für den Erfahrungsgrad überschreitet.

    Args:
        current_value: Aktueller Wert (der auf current_value + 1 gesteigert werden soll).
        experience_grade: Erfahrungsgrad des Charakters.
        value_type: Art des Werts ('eigenschaft', 'fertigkeit', 'kampftechnik', 'zauber').

    Returns:
        True wenn die Steigerung erlaubt ist (Wert + 1 <= Maximum).
    """
    grade = experience_grade.lower()
    if grade not in ERFAHRUNGSGRADE:
        return False

    grade_info = ERFAHRUNGSGRADE[grade]

    type_mapping = {
        "eigenschaft": "max_eigenschaft",
        "fertigkeit": "max_fertigkeit",
        "kampftechnik": "max_kampftechnik",
        "zauber": "max_zauber",
        "liturgie": "max_zauber",  # Gleiche Grenzen wie Zauber
    }

    max_key = type_mapping.get(value_type)
    if max_key is None:
        return False

    max_value = grade_info.get(max_key, 0)

    # current_value + 1 darf max_value nicht überschreiten
    return (current_value + 1) <= max_value


def apply_upgrade(
    character_data: dict,
    upgrade_type: str,
    upgrade_id: str,
    new_value: int,
) -> dict:
    """Wendet eine Steigerung an und berechnet abgeleitete Werte neu.

    Args:
        character_data: Charakterdaten (wird nicht verändert, Kopie wird zurückgegeben).
        upgrade_type: Art der Steigerung ('eigenschaft', 'fertigkeit',
                      'kampftechnik', 'zauber', 'liturgie').
        upgrade_id: ID/Name der Eigenschaft/Fertigkeit.
        new_value: Neuer Wert nach der Steigerung.

    Returns:
        Aktualisierte Charakterdaten (Kopie).
    """
    result = copy.deepcopy(character_data)

    if upgrade_type == "eigenschaft":
        if "eigenschaften" not in result:
            result["eigenschaften"] = {}
        result["eigenschaften"][upgrade_id] = new_value

    elif upgrade_type == "fertigkeit":
        if "fertigkeiten" not in result:
            result["fertigkeiten"] = {}
        if upgrade_id not in result["fertigkeiten"]:
            result["fertigkeiten"][upgrade_id] = {}
        result["fertigkeiten"][upgrade_id]["fw"] = new_value

    elif upgrade_type == "kampftechnik":
        if "kampftechniken" not in result:
            result["kampftechniken"] = {}
        if upgrade_id not in result["kampftechniken"]:
            result["kampftechniken"][upgrade_id] = {}
        result["kampftechniken"][upgrade_id]["ktw"] = new_value

    elif upgrade_type in ("zauber", "liturgie"):
        key = "zauber" if upgrade_type == "zauber" else "liturgien"
        if key not in result:
            result[key] = {}
        if upgrade_id not in result[key]:
            result[key][upgrade_id] = {}
        result[key][upgrade_id]["fw"] = new_value

    # Abgeleitete Werte neu berechnen
    result = recalculate_derived_values(result)

    return result


def recalculate_derived_values(character_data: dict) -> dict:
    """Berechnet alle abgeleiteten Werte aus den Eigenschaften neu.

    Abgeleitete Werte:
    - Lebensenergie (LeP): Basis je nach Spezies + KO + KO
    - Astralenergie (AsP): Basis + CH/IN (je nach Tradition)
    - Karmaenergie (KaP): Basis + MU
    - Geschwindigkeit (GS): Spezies-abhängig (Standard 8)
    - Initiative (INI): (MU + GE) / 2 (abgerundet)
    - Attacke (AT): MU / 2 (abgerundet) + Kampftechnik-Bonus
    - Parade (PA): (GE + KK) / 2 (abgerundet) + Kampftechnik-Bonus
    - Ausweichen (AW): GE / 2 (abgerundet)
    - Seelenkraft (SK): (MU + KL + IN) / 6 (abgerundet)
    - Zähigkeit (ZK): (KO + KO + KK) / 6 (abgerundet)

    Args:
        character_data: Charakterdaten (wird nicht verändert, Kopie wird zurückgegeben).

    Returns:
        Charakterdaten mit aktualisierten abgeleiteten Werten.
    """
    result = copy.deepcopy(character_data)
    e = result.get("eigenschaften", {})

    mu = e.get("MU", 8)
    kl = e.get("KL", 8)
    in_ = e.get("IN", 8)
    ch = e.get("CH", 8)
    ff = e.get("FF", 8)
    ge = e.get("GE", 8)
    ko = e.get("KO", 8)
    kk = e.get("KK", 8)

    # Abgeleitete Werte
    if "abgeleitete_werte" not in result:
        result["abgeleitete_werte"] = {}

    aw = result["abgeleitete_werte"]

    # INI-Basis: (MU + GE) / 2
    aw["ini_basis"] = (mu + ge) // 2

    # Ausweichen: GE / 2
    aw["aw"] = ge // 2

    # Seelenkraft: (MU + KL + IN) / 6
    aw["sk"] = (mu + kl + in_) // 6

    # Zähigkeit: (KO + KO + KK) / 6
    aw["zk"] = (ko + ko + kk) // 6

    # Geschwindigkeit: Spezies-Basis (Standard 8) + Modifikatoren
    gs_basis = result.get("gs_basis", 8)
    aw["gs"] = gs_basis

    # LeP: Spezies-Basis + 2 × KO + gekaufte LeP
    lep_basis = result.get("lep_basis", 5)  # Spezies-abhängig (Mensch: 5)
    lep_gekauft = result.get("lep_gekauft", 0)
    aw["max_lep"] = lep_basis + 2 * ko + lep_gekauft

    # AsP (nur wenn magisch)
    if result.get("ist_magisch", False):
        asp_basis = result.get("asp_basis", 20)
        asp_gekauft = result.get("asp_gekauft", 0)
        leiteigenschaft_asp = result.get("leiteigenschaft_asp", "CH")
        le_value = e.get(leiteigenschaft_asp, 8)
        aw["max_asp"] = asp_basis + le_value + asp_gekauft

    # KaP (nur wenn geweiht)
    if result.get("ist_geweiht", False):
        kap_basis = result.get("kap_basis", 20)
        kap_gekauft = result.get("kap_gekauft", 0)
        aw["max_kap"] = kap_basis + mu + kap_gekauft

    return result

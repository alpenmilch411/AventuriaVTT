"""
DSA5 Zustände und Status-Effekte (Conditions and Status Effects)

Implementiert die 8 Zustände (Stufe I-IV) und 15 Status-Effekte des DSA5-Regelwerks.
Bei Stufe IV eines beliebigen Zustands oder 8 Gesamt-Zustandsstufen ist der
Charakter Handlungsunfähig.

Alle Funktionen sind reine Funktionen ohne Seiteneffekte.
"""

from __future__ import annotations

import copy
from typing import Optional


# Die 8 DSA5-Zustände mit ihren Effekten pro Stufe
ZUSTAENDE: dict[str, dict] = {
    "Schmerz": {
        "effect_per_level": "-{level} auf alle Proben, -{level} GS",
        "max_stufe": 4,
        "modifiers_per_level": [
            {"type": "all_probes", "value_per_level": -1},
            {"type": "gs", "value_per_level": -1},
        ],
    },
    "Betäubung": {
        "effect_per_level": "-{level} auf alle Proben, -{level} GS, -{level} INI",
        "max_stufe": 4,
        "modifiers_per_level": [
            {"type": "all_probes", "value_per_level": -1},
            {"type": "gs", "value_per_level": -1},
            {"type": "ini", "value_per_level": -1},
        ],
    },
    "Furcht": {
        "effect_per_level": "-{level} auf alle Proben, -{level} GS",
        "max_stufe": 4,
        "modifiers_per_level": [
            {"type": "all_probes", "value_per_level": -1},
            {"type": "gs", "value_per_level": -1},
        ],
    },
    "Paralyse": {
        "effect_per_level": "-{level} auf alle Proben, -{level} AT, -{level} PA, -{level} AW",
        "max_stufe": 4,
        "modifiers_per_level": [
            {"type": "all_probes", "value_per_level": -1},
            {"type": "at", "value_per_level": -1},
            {"type": "pa", "value_per_level": -1},
            {"type": "aw", "value_per_level": -1},
        ],
    },
    "Verwirrung": {
        "effect_per_level": "-{level} auf alle Proben",
        "max_stufe": 4,
        "modifiers_per_level": [
            {"type": "all_probes", "value_per_level": -1},
        ],
    },
    "Berauscht": {
        "effect_per_level": "Stufe I: +1 AT/+1 MU/-1 Fernkampf, II: -2 auf alle, III: -3, IV: bewusstlos",
        "max_stufe": 4,
        "modifiers_per_level": [],  # Sonderbehandlung wegen unterschiedlicher Stufen-Effekte
    },
    "Belastung": {
        "effect_per_level": "-{level} GS, -{level} auf körperliche Proben, -{level} AT, -{level} PA, -{level} AW",
        "max_stufe": 4,
        "modifiers_per_level": [
            {"type": "gs", "value_per_level": -1},
            {"type": "physical_probes", "value_per_level": -1},
            {"type": "at", "value_per_level": -1},
            {"type": "pa", "value_per_level": -1},
            {"type": "aw", "value_per_level": -1},
        ],
    },
    "Entrückung": {
        "effect_per_level": "-{level} auf alle Proben",
        "max_stufe": 4,
        "modifiers_per_level": [
            {"type": "all_probes", "value_per_level": -1},
        ],
    },
}

# Die 15 Status-Effekte (binär: aktiv oder nicht)
STATUS_EFFECTS: list[str] = [
    "Liegend",
    "Bewusstlos",
    "Blind",
    "Taub",
    "Stumm",
    "Blutend",
    "Brennend",
    "Vergiftet",
    "Krank",
    "Fixiert",
    "Eingeengt",
    "Überrascht",
    "Handlungsunfähig",
    "Bewegungsunfähig",
    "Unsichtbar",
]


def apply_condition(
    current_conditions: dict,
    condition: str,
    levels: int,
    source: str = "physical",
) -> dict:
    """Wendet Zustandsstufen auf einen Charakter an.

    Regeln:
    - Zustände haben maximal Stufe IV (4)
    - Magische Quellen ('magical') stapeln nicht untereinander: Nur der höchste
      magische Wert zählt. Physische Quellen ('physical') stapeln normal.
    - Bei Stufe IV eines Zustands oder 8 Gesamt-Zustandsstufen:
      Charakter wird Handlungsunfähig.

    Args:
        current_conditions: Aktuelles Zustandsdict. Format:
            {
                "Schmerz": {"total": 2, "sources": [{"source": "physical", "levels": 2}]},
                ...
            }
        condition: Name des Zustands (muss in ZUSTAENDE sein).
        levels: Anzahl hinzuzufügender Stufen (positiv).
        source: Quelle: 'physical' oder 'magical'.

    Returns:
        Neues Zustandsdict (Kopie, Original bleibt unverändert).

    Raises:
        ValueError: Bei unbekanntem Zustand oder ungültiger Stufenzahl.
    """
    if condition not in ZUSTAENDE:
        raise ValueError(f"Unbekannter Zustand: '{condition}'. "
                         f"Erlaubt: {', '.join(ZUSTAENDE.keys())}")

    if levels < 0:
        raise ValueError("Stufenzahl muss positiv sein. Zum Entfernen: remove_condition().")

    if levels == 0:
        return copy.deepcopy(current_conditions)

    result = copy.deepcopy(current_conditions)
    max_stufe = ZUSTAENDE[condition]["max_stufe"]

    if condition not in result:
        result[condition] = {"total": 0, "sources": []}

    cond = result[condition]

    if source == "magical":
        # Magische Quellen stapeln nicht: Nur höchster Wert zählt
        existing_magical = None
        for s in cond["sources"]:
            if s["source"] == "magical":
                existing_magical = s
                break

        if existing_magical:
            if levels > existing_magical["levels"]:
                # Neuer magischer Wert ist höher: ersetzen
                diff = levels - existing_magical["levels"]
                existing_magical["levels"] = levels
                cond["total"] = min(cond["total"] + diff, max_stufe)
            # Sonst: kein Effekt (bestehender magischer Wert ist höher oder gleich)
        else:
            cond["sources"].append({"source": "magical", "levels": levels})
            cond["total"] = min(cond["total"] + levels, max_stufe)
    else:
        # Physische Quellen stapeln
        cond["sources"].append({"source": source, "levels": levels})
        cond["total"] = min(cond["total"] + levels, max_stufe)

    # Sicherstellen, dass total nicht über max_stufe geht
    cond["total"] = min(cond["total"], max_stufe)

    return result


def remove_condition(
    current_conditions: dict,
    condition: str,
    levels: Optional[int] = None,
) -> dict:
    """Entfernt Zustandsstufen.

    Args:
        current_conditions: Aktuelles Zustandsdict.
        condition: Name des Zustands.
        levels: Anzahl zu entfernender Stufen. Wenn None: Zustand komplett entfernen.

    Returns:
        Neues Zustandsdict (Kopie).
    """
    if condition not in ZUSTAENDE:
        raise ValueError(f"Unbekannter Zustand: '{condition}'")

    result = copy.deepcopy(current_conditions)

    if condition not in result:
        return result

    if levels is None:
        # Zustand komplett entfernen
        del result[condition]
    else:
        cond = result[condition]
        cond["total"] = max(0, cond["total"] - levels)

        if cond["total"] <= 0:
            del result[condition]
        else:
            # Quellen anteilig reduzieren (von hinten nach vorne)
            remaining_to_remove = levels
            new_sources = []
            for s in reversed(cond["sources"]):
                if remaining_to_remove <= 0:
                    new_sources.insert(0, s)
                elif s["levels"] <= remaining_to_remove:
                    remaining_to_remove -= s["levels"]
                    # Quelle komplett entfernt
                else:
                    s["levels"] -= remaining_to_remove
                    remaining_to_remove = 0
                    new_sources.insert(0, s)
            cond["sources"] = new_sources

    return result


def get_total_condition_levels(conditions: dict) -> int:
    """Berechnet die Gesamtzahl aller Zustandsstufen.

    Args:
        conditions: Zustandsdict.

    Returns:
        Summe aller Zustandsstufen.
    """
    total = 0
    for condition_name, condition_data in conditions.items():
        if isinstance(condition_data, dict) and "total" in condition_data:
            total += condition_data["total"]
    return total


def is_handlungsunfaehig(conditions: dict) -> bool:
    """Prüft ob ein Charakter Handlungsunfähig ist.

    Handlungsunfähig wenn:
    - Ein beliebiger Zustand auf Stufe IV (4) ist, ODER
    - Die Summe aller Zustandsstufen >= 8 ist

    Args:
        conditions: Zustandsdict.

    Returns:
        True wenn der Charakter Handlungsunfähig ist.
    """
    for condition_name, condition_data in conditions.items():
        if isinstance(condition_data, dict) and condition_data.get("total", 0) >= 4:
            return True

    if get_total_condition_levels(conditions) >= 8:
        return True

    return False


def get_condition_modifiers(conditions: dict) -> list[dict]:
    """Berechnet alle aktiven Modifikatoren aus den aktuellen Zuständen.

    Berücksichtigt die Sonderregeln für Berauscht:
    - Stufe I: +1 AT, +1 MU-Proben, -1 Fernkampf
    - Stufe II: -2 auf alle Proben
    - Stufe III: -3 auf alle Proben
    - Stufe IV: Bewusstlos/Handlungsunfähig

    Args:
        conditions: Zustandsdict.

    Returns:
        Liste von Modifikatoren. Jeder:
            {source: str, type: str, value: int}
            z.B. {source: 'Schmerz 2', type: 'all_probes', value: -2}
    """
    result_modifiers = []

    for condition_name, condition_data in conditions.items():
        if not isinstance(condition_data, dict):
            continue

        level = condition_data.get("total", 0)
        if level <= 0:
            continue

        if condition_name not in ZUSTAENDE:
            continue

        zustand_def = ZUSTAENDE[condition_name]

        # Sonderbehandlung für Berauscht
        if condition_name == "Berauscht":
            source = f"Berauscht {level}"
            if level == 1:
                result_modifiers.extend([
                    {"source": source, "type": "at", "value": 1},
                    {"source": source, "type": "mu_probes", "value": 1},
                    {"source": source, "type": "fk", "value": -1},
                ])
            elif level == 2:
                result_modifiers.append(
                    {"source": source, "type": "all_probes", "value": -2}
                )
            elif level == 3:
                result_modifiers.append(
                    {"source": source, "type": "all_probes", "value": -3}
                )
            elif level >= 4:
                result_modifiers.append(
                    {"source": source, "type": "handlungsunfaehig", "value": 0}
                )
            continue

        # Normale Zustände
        source = f"{condition_name} {level}"
        for mod_def in zustand_def.get("modifiers_per_level", []):
            result_modifiers.append({
                "source": source,
                "type": mod_def["type"],
                "value": mod_def["value_per_level"] * level,
            })

    return result_modifiers

"""
DSA5 Modifikator-Aggregation (Modifier Aggregation)

Kombiniert Modifikatoren aus verschiedenen Quellen:
Zustände, Wetter, Umgebung, Manöver, Zauber, Gegenstände.

Alle Funktionen sind reine Funktionen ohne Seiteneffekte.
"""

from __future__ import annotations

from typing import Optional


# Sichtmodifikatoren nach Beleuchtung
SICHT_MODIFIKATOREN: dict[str, dict] = {
    "hell": {
        "description": "Helle Beleuchtung (Tageslicht, Fackel in kleinem Raum)",
        "modifiers": [],  # Keine Modifikatoren
    },
    "daemmerung": {
        "description": "Dämmerung oder schummriges Licht",
        "modifiers": [
            {"type": "at", "value": -1},
            {"type": "pa", "value": -1},
            {"type": "aw", "value": -1},
            {"type": "fk", "value": -2},
            {"type": "perception", "value": -1},
        ],
    },
    "dunkel": {
        "description": "Dunkelheit (Mondlicht, schwache Fackel in großem Raum)",
        "modifiers": [
            {"type": "at", "value": -3},
            {"type": "pa", "value": -3},
            {"type": "aw", "value": -3},
            {"type": "fk", "value": -6},
            {"type": "perception", "value": -3},
        ],
    },
    "finsternis": {
        "description": "Absolute Finsternis (keinerlei Lichtquelle)",
        "modifiers": [
            {"type": "at", "value": -6},
            {"type": "pa", "value": -6},
            {"type": "aw", "value": -6},
            {"type": "fk", "value": -99},  # Fernkampf praktisch unmöglich
            {"type": "perception", "value": -6},
        ],
    },
}

# Wetter-Modifikatoren
WETTER_MODIFIKATOREN: dict[str, dict] = {
    "klar": {
        "description": "Klares Wetter",
        "modifiers": [],
    },
    "bewoelkt": {
        "description": "Bewölkt",
        "modifiers": [],
    },
    "regen": {
        "description": "Leichter Regen",
        "modifiers": [
            {"type": "fk", "value": -1},
            {"type": "perception", "value": -1},
        ],
    },
    "starker_regen": {
        "description": "Starker Regen",
        "modifiers": [
            {"type": "fk", "value": -3},
            {"type": "perception", "value": -3},
            {"type": "gs", "value": -1},
        ],
    },
    "sturm": {
        "description": "Sturm",
        "modifiers": [
            {"type": "fk", "value": -5},
            {"type": "at", "value": -1},
            {"type": "pa", "value": -1},
            {"type": "perception", "value": -4},
            {"type": "gs", "value": -2},
        ],
    },
    "schnee": {
        "description": "Schnee",
        "modifiers": [
            {"type": "fk", "value": -2},
            {"type": "gs", "value": -1},
        ],
    },
    "nebel": {
        "description": "Nebel",
        "modifiers": [
            {"type": "fk", "value": -3},
            {"type": "perception", "value": -3},
        ],
    },
    "hitze": {
        "description": "Extreme Hitze",
        "modifiers": [
            {"type": "physical_probes", "value": -1},
        ],
    },
}

# Fernkampf-Entfernungsbereiche
FERNKAMPF_DISTANZEN: dict[str, int] = {
    "nah": 0,       # Keine Modifikation
    "mittel": -2,    # -2 FK
    "weit": -4,      # -4 FK
    "extrem_weit": -8,  # Praktisch unmöglich ohne SF
}

# Deckungsmodifikatoren
DECKUNG_MODIFIKATOREN: dict[str, int] = {
    "keine": 0,
    "viertel": -2,   # 1/4 Deckung
    "halb": -4,       # 1/2 Deckung
    "dreiviertel": -6, # 3/4 Deckung
    "voll": -99,       # Volle Deckung (nicht treffbar)
}


def aggregate_modifiers(sources: list[dict]) -> dict:
    """Kombiniert Modifikatoren aus verschiedenen Quellen.

    Addiert alle Modifikatoren des gleichen Typs. Gibt eine Gesamtübersicht
    und detaillierte Aufschlüsselung zurück.

    Args:
        sources: Liste von Modifikator-Quellen. Jede:
            {
                source_name (str): Name der Quelle (z.B. 'Schmerz 2', 'Regen')
                modifiers (list[dict]): [{type: str, value: int}]
            }

    Returns:
        dict mit:
            total_at_mod (int): Gesamt-AT-Modifikator
            total_pa_mod (int): Gesamt-PA-Modifikator
            total_aw_mod (int): Gesamt-AW-Modifikator
            total_fk_mod (int): Gesamt-FK-Modifikator
            total_ini_mod (int): Gesamt-INI-Modifikator
            total_gs_mod (int): Gesamt-GS-Modifikator
            total_probe_mod (int): Gesamt-Proben-Modifikator (alle Proben)
            total_physical_probe_mod (int): Gesamt-körperliche-Proben-Modifikator
            breakdown (list[dict]): Detaillierte Aufschlüsselung pro Quelle
    """
    totals = {
        "at": 0,
        "pa": 0,
        "aw": 0,
        "fk": 0,
        "ini": 0,
        "gs": 0,
        "all_probes": 0,
        "physical_probes": 0,
        "perception": 0,
    }

    breakdown = []

    for source in sources:
        source_name = source.get("source_name", "Unbekannt")
        mods = source.get("modifiers", [])

        source_breakdown = {
            "source": source_name,
            "modifiers": [],
        }

        for mod in mods:
            mod_type = mod.get("type", "")
            mod_value = mod.get("value", 0)

            if mod_type in totals:
                totals[mod_type] += mod_value
            elif mod_type == "all_probes":
                totals["all_probes"] += mod_value

            source_breakdown["modifiers"].append({
                "type": mod_type,
                "value": mod_value,
            })

        if source_breakdown["modifiers"]:
            breakdown.append(source_breakdown)

    # "all_probes" beeinflusst auch AT, PA, AW, FK
    all_probe_mod = totals["all_probes"]

    return {
        "total_at_mod": totals["at"] + all_probe_mod,
        "total_pa_mod": totals["pa"] + all_probe_mod,
        "total_aw_mod": totals["aw"] + all_probe_mod,
        "total_fk_mod": totals["fk"] + all_probe_mod,
        "total_ini_mod": totals["ini"],
        "total_gs_mod": totals["gs"],
        "total_probe_mod": all_probe_mod,
        "total_physical_probe_mod": totals["physical_probes"] + all_probe_mod,
        "total_perception_mod": totals["perception"],
        "breakdown": breakdown,
    }


def get_environmental_modifiers(
    lighting: Optional[str] = None,
    weather: Optional[str] = None,
    terrain: Optional[str] = None,
) -> list[dict]:
    """Gibt Modifikatoren für Umgebungsbedingungen zurück.

    Args:
        lighting: Beleuchtung: 'hell', 'daemmerung', 'dunkel', 'finsternis'.
        weather: Wetter: 'klar', 'bewoelkt', 'regen', 'starker_regen',
                 'sturm', 'schnee', 'nebel', 'hitze'.
        terrain: Gelände (für zukünftige Erweiterung).

    Returns:
        Liste von Modifikator-Dicts. Jeder:
            {source: str, type: str, value: int}
    """
    result = []

    if lighting and lighting in SICHT_MODIFIKATOREN:
        sicht = SICHT_MODIFIKATOREN[lighting]
        for mod in sicht["modifiers"]:
            result.append({
                "source": f"Sicht: {sicht['description']}",
                "type": mod["type"],
                "value": mod["value"],
            })

    if weather and weather in WETTER_MODIFIKATOREN:
        wetter = WETTER_MODIFIKATOREN[weather]
        for mod in wetter["modifiers"]:
            result.append({
                "source": f"Wetter: {wetter['description']}",
                "type": mod["type"],
                "value": mod["value"],
            })

    # Gelände-Modifikatoren (Erweiterungspunkt)
    if terrain:
        terrain_mods = _get_terrain_modifiers(terrain)
        result.extend(terrain_mods)

    return result


def get_ranged_modifiers(
    distance: int,
    range_brackets: dict,
    target_moving: bool = False,
    shooter_moved: bool = False,
    target_cover: Optional[str] = None,
) -> list[dict]:
    """Berechnet Fernkampf-Modifikatoren.

    Fernkampf-Erschwerungen:
    - Entfernungsbereich (nah/mittel/weit/extrem)
    - Ziel in Bewegung: -2
    - Schütze hat sich bewegt: -2
    - Deckung des Ziels: variable Erschwerung

    Args:
        distance: Entfernung zum Ziel in Schritt.
        range_brackets: Reichweitenbereiche der Waffe:
            {nah: int, mittel: int, weit: int}
            z.B. {nah: 10, mittel: 30, weit: 50}
        target_moving: Ob sich das Ziel bewegt.
        shooter_moved: Ob sich der Schütze in dieser Runde bewegt hat.
        target_cover: Deckung des Ziels: 'keine', 'viertel', 'halb',
                      'dreiviertel', 'voll'.

    Returns:
        Liste von Modifikator-Dicts. Jeder:
            {source: str, type: str, value: int}
    """
    result = []

    # Entfernungsbereich ermitteln
    nah = range_brackets.get("nah", 10)
    mittel = range_brackets.get("mittel", 30)
    weit = range_brackets.get("weit", 50)

    if distance <= nah:
        bracket = "nah"
        bracket_mod = FERNKAMPF_DISTANZEN["nah"]
    elif distance <= mittel:
        bracket = "mittel"
        bracket_mod = FERNKAMPF_DISTANZEN["mittel"]
    elif distance <= weit:
        bracket = "weit"
        bracket_mod = FERNKAMPF_DISTANZEN["weit"]
    else:
        bracket = "extrem_weit"
        bracket_mod = FERNKAMPF_DISTANZEN["extrem_weit"]

    if bracket_mod != 0:
        result.append({
            "source": f"Entfernung: {bracket} ({distance} Schritt)",
            "type": "fk",
            "value": bracket_mod,
        })

    # Ziel in Bewegung
    if target_moving:
        result.append({
            "source": "Ziel in Bewegung",
            "type": "fk",
            "value": -2,
        })

    # Schütze hat sich bewegt
    if shooter_moved:
        result.append({
            "source": "Schütze hat sich bewegt",
            "type": "fk",
            "value": -2,
        })

    # Deckung
    if target_cover and target_cover in DECKUNG_MODIFIKATOREN:
        cover_mod = DECKUNG_MODIFIKATOREN[target_cover]
        if cover_mod != 0:
            result.append({
                "source": f"Deckung: {target_cover}",
                "type": "fk",
                "value": cover_mod,
            })

    return result


def _get_terrain_modifiers(terrain: str) -> list[dict]:
    """Interne Hilfsfunktion für Gelände-Modifikatoren.

    Args:
        terrain: Geländetyp.

    Returns:
        Liste von Modifikator-Dicts.
    """
    terrain_effects = {
        "sumpf": [
            {"source": "Gelände: Sumpf", "type": "gs", "value": -2},
            {"source": "Gelände: Sumpf", "type": "physical_probes", "value": -1},
        ],
        "eis": [
            {"source": "Gelände: Eis", "type": "gs", "value": -1},
            {"source": "Gelände: Eis", "type": "at", "value": -1},
            {"source": "Gelände: Eis", "type": "pa", "value": -1},
        ],
        "wasser_knie": [
            {"source": "Gelände: Knietiefes Wasser", "type": "gs", "value": -2},
            {"source": "Gelände: Knietiefes Wasser", "type": "at", "value": -1},
        ],
        "wasser_hueft": [
            {"source": "Gelände: Hüfttiefes Wasser", "type": "gs", "value": -4},
            {"source": "Gelände: Hüfttiefes Wasser", "type": "at", "value": -2},
            {"source": "Gelände: Hüfttiefes Wasser", "type": "pa", "value": -2},
        ],
        "enger_raum": [
            {"source": "Gelände: Enger Raum", "type": "at", "value": -4},
            {"source": "Gelände: Enger Raum", "type": "pa", "value": -4},
        ],
    }

    return terrain_effects.get(terrain, [])

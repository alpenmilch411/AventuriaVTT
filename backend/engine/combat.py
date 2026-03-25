"""
DSA5 Kampfmechanik (Combat Resolution)

Implementiert Angriffs- und Verteidigungsauflösung sowie Manöververwaltung
gemäß dem DSA5-Regelwerk.

Alle Funktionen sind reine Funktionen ohne Seiteneffekte.
"""

from __future__ import annotations

from typing import Optional


# Basis-Manöver (für alle Kämpfer verfügbar)
BASIS_MANEUVERS = {
    "wuchtschlag": {
        "id": "wuchtschlag",
        "name": "Wuchtschlag",
        "type": "basis",
        "at_mod": -1,  # Pro Stufe -1 AT
        "pa_mod": 0,
        "damage_mod": +1,  # Pro Stufe +1 TP
        "description": "Erhöht den Schaden auf Kosten der Trefferchance. "
                       "Pro Stufe: AT -1, TP +1. Maximal 3 Stufen (5 mit SF).",
        "max_stufe": 3,  # 5 mit Sonderfertigkeit
        "sf_name": "Wuchtschlag",
        "penalty_without_sf": 0,  # Basis-Manöver, aber ohne SF max 3 statt 5
    },
    "finte": {
        "id": "finte",
        "name": "Finte",
        "type": "basis",
        "at_mod": -1,  # Pro Stufe -1 AT
        "pa_mod": 0,
        "damage_mod": 0,
        "description": "Erschwert die Verteidigung des Gegners. "
                       "Pro Stufe: AT -1, gegnerische VT -1. Maximal 3 Stufen (5 mit SF).",
        "defense_mod": -1,  # Pro Stufe -1 auf gegnerische Verteidigung
        "max_stufe": 3,  # 5 mit Sonderfertigkeit
        "sf_name": "Finte",
        "penalty_without_sf": 0,
    },
}

# Spezial-Manöver (nur mit Sonderfertigkeit verfügbar)
SPEZIAL_MANEUVERS = {
    "hammerschlag": {
        "id": "hammerschlag",
        "name": "Hammerschlag",
        "type": "spezial",
        "at_mod": -4,
        "pa_mod": -4,
        "damage_mod": 0,  # Ignoriert RS des Gegners
        "description": "Ignoriert die Rüstung des Gegners. AT -4, nächste PA -4.",
        "sf_name": "Hammerschlag",
        "special_effect": "ignore_rs",
    },
    "gezielter_stich": {
        "id": "gezielter_stich",
        "name": "Gezielter Stich",
        "type": "spezial",
        "at_mod": -2,
        "pa_mod": 0,
        "damage_mod": 0,
        "description": "Halbiert den RS des Gegners (aufgerundet). AT -2.",
        "sf_name": "Gezielter Stich",
        "special_effect": "halve_rs",
    },
    "niederwerfen": {
        "id": "niederwerfen",
        "name": "Niederwerfen",
        "type": "spezial",
        "at_mod": -2,
        "pa_mod": 0,
        "damage_mod": 0,
        "description": "Wirft den Gegner zu Boden (Status Liegend). AT -2.",
        "sf_name": "Niederwerfen",
        "special_effect": "knockdown",
    },
    "entwaffnen": {
        "id": "entwaffnen",
        "name": "Entwaffnen",
        "type": "spezial",
        "at_mod": -4,
        "pa_mod": 0,
        "damage_mod": 0,
        "description": "Entwaffnet den Gegner. AT -4, kein Schaden.",
        "sf_name": "Entwaffnen",
        "special_effect": "disarm",
    },
    "betaeubungsschlag": {
        "id": "betaeubungsschlag",
        "name": "Betäubungsschlag",
        "type": "spezial",
        "at_mod": -2,
        "pa_mod": 0,
        "damage_mod": 0,
        "description": "Schaden wird als Betäubungsschaden verrechnet. AT -2.",
        "sf_name": "Betäubungsschlag",
        "special_effect": "stun_damage",
    },
    "todesstoß": {
        "id": "todesstoß",
        "name": "Todesstoß",
        "type": "spezial",
        "at_mod": 0,
        "pa_mod": 0,
        "damage_mod": 0,
        "description": "Gegen handlungsunfähige Gegner. Automatischer Treffer, "
                       "Schaden wird verdoppelt.",
        "sf_name": "Todesstoß",
        "special_effect": "coup_de_grace",
    },
}


def resolve_attack(
    at_value: int,
    roll: int,
    maneuver: Optional[dict] = None,
    confirmation_roll: Optional[int] = None,
) -> dict:
    """Löst einen Nahkampf- oder Fernkampfangriff auf.

    Regeln:
    - Wurf <= AT-Wert: Treffer
    - Wurf von 1: Kritischer Treffer (Bestätigungswurf nötig)
    - Wurf von 20: Patzer (Bestätigungswurf nötig)

    Args:
        at_value: Attacke-Wert des Angreifers.
        roll: Würfelergebnis (1-20).
        maneuver: Optionales Manöver mit at_mod, stufe etc.
            {id, stufe (optional, default 1), at_mod_per_stufe (optional)}
        confirmation_roll: Bestätigungswurf für Kritisch/Patzer.

    Returns:
        dict mit:
            hit (bool): Treffer erzielt
            roll (int): Würfelergebnis
            effective_at (int): Effektiver AT-Wert
            critical (bool): Bestätigter kritischer Treffer
            patzer (bool): Bestätigter Patzer
            critical_unconfirmed (bool): Unbestätigter kritischer Treffer
            patzer_unconfirmed (bool): Unbestätigter Patzer
            confirmation_roll (int|None): Bestätigungswurf
            maneuver_applied (dict|None): Angewandtes Manöver
    """
    at_mod = 0
    maneuver_applied = None

    if maneuver:
        stufe = maneuver.get("stufe", 1)
        per_stufe = maneuver.get("at_mod", maneuver.get("at_mod_per_stufe", 0))
        at_mod = per_stufe * stufe
        maneuver_applied = {
            "id": maneuver.get("id", "unknown"),
            "stufe": stufe,
            "at_mod": at_mod,
        }

    effective_at = at_value + at_mod

    # Eine 1 ist immer ein Treffer, eine 20 immer ein Fehlschlag
    if roll == 1:
        base_hit = True
    elif roll == 20:
        base_hit = False
    else:
        base_hit = roll <= effective_at

    critical = False
    patzer = False
    critical_unconfirmed = False
    patzer_unconfirmed = False

    if roll == 1:
        if confirmation_roll is not None:
            if confirmation_roll <= effective_at:
                critical = True
            else:
                critical_unconfirmed = True
        else:
            critical_unconfirmed = True

    if roll == 20:
        if confirmation_roll is not None:
            if confirmation_roll > effective_at:
                patzer = True
            else:
                patzer_unconfirmed = True
        else:
            patzer_unconfirmed = True

    hit = base_hit or critical

    return {
        "hit": hit,
        "roll": roll,
        "effective_at": effective_at,
        "critical": critical,
        "patzer": patzer,
        "critical_unconfirmed": critical_unconfirmed,
        "patzer_unconfirmed": patzer_unconfirmed,
        "confirmation_roll": confirmation_roll,
        "maneuver_applied": maneuver_applied,
    }


def resolve_defense(
    defense_type: str,
    defense_value: int,
    roll: int,
    reaction_count: int = 0,
    has_schip: bool = True,
    confirmation_roll: Optional[int] = None,
) -> dict:
    """Löst eine Verteidigungsaktion auf (Parade oder Ausweichen).

    Regeln:
    - Wurf <= Verteidigungswert: Erfolg
    - Mehrfache Reaktionen pro Kampfrunde:
      - Mit Schicksalspunkten: Beliebig viele, je -3 ab der zweiten
      - Ohne Schicksalspunkte: Nur 1 Reaktion pro Runde
    - Wurf von 1: Kritische Verteidigung (Bestätigungswurf nötig)
    - Wurf von 20: Patzer (Bestätigungswurf nötig)

    Args:
        defense_type: 'parade' oder 'ausweichen'.
        defense_value: PA- oder AW-Wert.
        roll: Würfelergebnis (1-20).
        reaction_count: 0-basiert. 0 = erste Reaktion (kein Abzug),
            1 = zweite Reaktion (-3), 2 = dritte (-6), etc.
        has_schip: Ob der Charakter Schicksalspunkte hat.
            Ohne Schips nur 1 Reaktion pro Runde erlaubt.
        confirmation_roll: Bestätigungswurf für Kritisch/Patzer.

    Returns:
        dict mit:
            success (bool): Verteidigung erfolgreich
            roll (int): Würfelergebnis
            defense_type (str): Art der Verteidigung
            effective_value (int): Effektiver Verteidigungswert
            reaction_penalty (int): Abzug durch mehrfache Reaktion
            critical (bool): Bestätigte kritische Verteidigung
            patzer (bool): Bestätigter Patzer
            confirmation_roll (int|None): Bestätigungswurf
            allowed (bool): Ob die Reaktion überhaupt erlaubt ist
            reason (str|None): Grund bei nicht erlaubter Reaktion
    """
    if defense_type not in ("parade", "ausweichen"):
        raise ValueError(f"Unbekannter Verteidigungstyp: {defense_type}. "
                         f"Erlaubt: 'parade', 'ausweichen'")

    # Prüfung ob Reaktion erlaubt
    if not has_schip and reaction_count > 0:
        return {
            "success": False,
            "roll": roll,
            "defense_type": defense_type,
            "effective_value": defense_value,
            "reaction_penalty": 0,
            "critical": False,
            "patzer": False,
            "confirmation_roll": None,
            "allowed": False,
            "reason": "Ohne Schicksalspunkte ist nur 1 Reaktion pro Runde erlaubt.",
        }

    # Reaktionsabzug: ab der zweiten Reaktion je -3
    reaction_penalty = reaction_count * -3 if reaction_count > 0 else 0
    effective_value = defense_value + reaction_penalty

    # Erfolgsberechnung
    if roll == 1:
        base_success = True
    elif roll == 20:
        base_success = False
    else:
        base_success = roll <= effective_value

    critical = False
    patzer = False

    if roll == 1:
        if confirmation_roll is not None and confirmation_roll <= effective_value:
            critical = True

    if roll == 20:
        if confirmation_roll is not None and confirmation_roll > effective_value:
            patzer = True

    success = base_success or critical

    return {
        "success": success,
        "roll": roll,
        "defense_type": defense_type,
        "effective_value": effective_value,
        "reaction_penalty": reaction_penalty,
        "critical": critical,
        "patzer": patzer,
        "confirmation_roll": confirmation_roll,
        "allowed": True,
        "reason": None,
    }


def get_available_maneuvers(
    character_data: dict,
    weapon_data: dict,
) -> list[dict]:
    """Gibt die verfügbaren Kampfmanöver basierend auf Sonderfertigkeiten und Waffe zurück.

    Basis-Manöver (Wuchtschlag, Finte) stehen allen zur Verfügung.
    Ohne die zugehörige Sonderfertigkeit ist die maximale Stufe auf 3 begrenzt.
    Mit SF ist die maximale Stufe 5.

    Spezial-Manöver sind nur mit der entsprechenden Sonderfertigkeit verfügbar.

    Args:
        character_data: Charakterdaten mit mindestens:
            sonderfertigkeiten (list[str]): Liste der SF-Namen
        weapon_data: Waffendaten mit mindestens:
            kampftechnik (str): Name der Kampftechnik
            reichweite (str, optional): 'kurz', 'mittel', 'lang'

    Returns:
        Liste von Manöver-Dicts, jeweils mit:
            id, name, type, at_mod, pa_mod, damage_mod, description, has_sf, max_stufe
    """
    character_sfs = set(character_data.get("sonderfertigkeiten", []))
    available = []

    # Basis-Manöver: immer verfügbar
    for maneuver_id, maneuver in BASIS_MANEUVERS.items():
        has_sf = maneuver["sf_name"] in character_sfs
        max_stufe = 5 if has_sf else maneuver["max_stufe"]
        available.append({
            "id": maneuver_id,
            "name": maneuver["name"],
            "type": maneuver["type"],
            "at_mod": maneuver["at_mod"],
            "pa_mod": maneuver["pa_mod"],
            "damage_mod": maneuver["damage_mod"],
            "description": maneuver["description"],
            "has_sf": has_sf,
            "max_stufe": max_stufe,
        })

    # Spezial-Manöver: nur mit SF
    for maneuver_id, maneuver in SPEZIAL_MANEUVERS.items():
        has_sf = maneuver["sf_name"] in character_sfs
        if has_sf:
            available.append({
                "id": maneuver_id,
                "name": maneuver["name"],
                "type": maneuver["type"],
                "at_mod": maneuver["at_mod"],
                "pa_mod": maneuver["pa_mod"],
                "damage_mod": maneuver.get("damage_mod", 0),
                "description": maneuver["description"],
                "has_sf": True,
                "special_effect": maneuver.get("special_effect"),
            })

    return available


def validate_maneuver_combination(maneuvers: list[str]) -> dict:
    """Prüft ob eine Kombination von Manövern gültig ist.

    Regeln:
    - Maximal 1 Basis-Manöver pro Angriff
    - Maximal 1 Spezial-Manöver pro Angriff
    - Insgesamt maximal 2 Manöver (1 Basis + 1 Spezial)

    Args:
        maneuvers: Liste von Manöver-IDs.

    Returns:
        dict mit:
            valid (bool): Kombination gültig
            reason (str|None): Begründung bei ungültiger Kombination
            basis_count (int): Anzahl Basis-Manöver
            spezial_count (int): Anzahl Spezial-Manöver
    """
    if not maneuvers:
        return {"valid": True, "reason": None, "basis_count": 0, "spezial_count": 0}

    basis_count = 0
    spezial_count = 0
    unknown = []

    all_maneuvers = {**BASIS_MANEUVERS, **SPEZIAL_MANEUVERS}

    for m_id in maneuvers:
        if m_id in BASIS_MANEUVERS:
            basis_count += 1
        elif m_id in SPEZIAL_MANEUVERS:
            spezial_count += 1
        else:
            unknown.append(m_id)

    if unknown:
        return {
            "valid": False,
            "reason": f"Unbekannte Manöver: {', '.join(unknown)}",
            "basis_count": basis_count,
            "spezial_count": spezial_count,
        }

    if basis_count > 1:
        return {
            "valid": False,
            "reason": "Maximal 1 Basis-Manöver pro Angriff erlaubt.",
            "basis_count": basis_count,
            "spezial_count": spezial_count,
        }

    if spezial_count > 1:
        return {
            "valid": False,
            "reason": "Maximal 1 Spezial-Manöver pro Angriff erlaubt.",
            "basis_count": basis_count,
            "spezial_count": spezial_count,
        }

    return {
        "valid": True,
        "reason": None,
        "basis_count": basis_count,
        "spezial_count": spezial_count,
    }

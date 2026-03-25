"""
DSA5 Schadensberechnung (Damage Calculation)

Implementiert die Schadensberechnung, Schmerzstufenermittlung und Todescheck
gemäß dem DSA5-Regelwerk.

Alle Funktionen sind reine Funktionen ohne Seiteneffekte.
"""

from __future__ import annotations

import re
from typing import Optional


def parse_damage_formula(formula: str) -> dict:
    """Parst eine DSA5-Schadensformel in ihre Bestandteile.

    Unterstützte Formate:
    - '1W6+4'  → 1 Würfel mit 6 Seiten, +4 Bonus
    - '2W6+2'  → 2 Würfel mit 6 Seiten, +2 Bonus
    - '1W6-1'  → 1 Würfel mit 6 Seiten, -1 Bonus
    - '1W6'    → 1 Würfel mit 6 Seiten, kein Bonus
    - '2W20'   → 2 Würfel mit 20 Seiten
    - '3'      → Nur fester Schadenswert (0 Würfel)

    Args:
        formula: Schadensformel als String (z.B. '1W6+4').

    Returns:
        dict mit:
            dice_count (int): Anzahl der Würfel
            dice_sides (int): Seitenzahl der Würfel
            bonus (int): Fester Schadensbonus/-malus

    Raises:
        ValueError: Bei ungültigem Formelformat.
    """
    formula = formula.strip().upper()

    # Nur Zahl (fester Schaden)
    if re.match(r'^[+-]?\d+$', formula):
        return {
            "dice_count": 0,
            "dice_sides": 0,
            "bonus": int(formula),
        }

    # Standard-Format: NWS+B oder NWS-B oder NWS
    match = re.match(r'^(\d+)W(\d+)([+-]\d+)?$', formula)
    if not match:
        raise ValueError(f"Ungültiges Schadensformat: '{formula}'. "
                         f"Erwartet z.B. '1W6+4', '2W6', '1W6-1'.")

    dice_count = int(match.group(1))
    dice_sides = int(match.group(2))
    bonus = int(match.group(3)) if match.group(3) else 0

    return {
        "dice_count": dice_count,
        "dice_sides": dice_sides,
        "bonus": bonus,
    }


def calculate_damage(
    base_damage: str,
    roll: int | list[int],
    modifiers: Optional[list[dict]] = None,
    rs: int = 0,
) -> dict:
    """Berechnet den Schaden eines Treffers.

    Ablauf:
    1. Schadensformel parsen (z.B. '1W6+4')
    2. Würfelergebnis + Bonus = Roh-TP (Trefferpunkte)
    3. Modifikatoren anwenden (Manöver, Vorteile, etc.)
    4. Rüstungsschutz (RS) abziehen
    5. Endergebnis = SP (Schadenspunkte), mindestens 0

    Args:
        base_damage: Schadensformel (z.B. '1W6+4').
        roll: Würfelergebnis(se). Einzelner int bei 1WX, Liste bei mehreren Würfeln.
        modifiers: Liste von Schadensmodifikatoren.
            Jeder: {source: str, value: int, type: str}
            type kann sein: 'flat' (fester Wert), 'multiply_before_rs' (Multiplikator),
                           'ignore_rs' (RS wird ignoriert), 'halve_rs' (RS halbiert)
        rs: Rüstungsschutz des Ziels.

    Returns:
        dict mit:
            raw_tp (int): Roh-Trefferpunkte (vor RS)
            modifiers_applied (list[dict]): Angewandte Modifikatoren
            rs (int): Effektiver Rüstungsschutz
            sp (int): Endgültige Schadenspunkte (nach RS, mindestens 0)
            formula_parsed (dict): Geparste Schadensformel
            roll (int|list[int]): Verwendetes Würfelergebnis
    """
    if modifiers is None:
        modifiers = []

    formula = parse_damage_formula(base_damage)

    # Würfelsumme berechnen
    if isinstance(roll, list):
        dice_total = sum(roll)
    else:
        dice_total = roll

    # Roh-TP: Würfelsumme + Bonus
    raw_tp = dice_total + formula["bonus"]

    # Modifikatoren anwenden
    flat_bonus = 0
    multiplier = 1.0
    effective_rs = rs
    applied = []

    for mod in modifiers:
        mod_type = mod.get("type", "flat")
        mod_value = mod.get("value", 0)
        mod_source = mod.get("source", "unbekannt")

        if mod_type == "flat":
            flat_bonus += mod_value
            applied.append({"source": mod_source, "type": "flat", "value": mod_value})
        elif mod_type == "multiply_before_rs":
            multiplier *= mod_value
            applied.append({"source": mod_source, "type": "multiply_before_rs", "value": mod_value})
        elif mod_type == "ignore_rs":
            effective_rs = 0
            applied.append({"source": mod_source, "type": "ignore_rs", "value": 0})
        elif mod_type == "halve_rs":
            effective_rs = -(-effective_rs // 2)  # Aufrunden bei Halbierung
            applied.append({"source": mod_source, "type": "halve_rs", "value": effective_rs})

    # Berechnung: (Roh-TP + flat_bonus) * multiplier - RS
    modified_tp = int((raw_tp + flat_bonus) * multiplier)
    sp = max(0, modified_tp - effective_rs)

    return {
        "raw_tp": raw_tp,
        "modifiers_applied": applied,
        "rs": effective_rs,
        "sp": sp,
        "formula_parsed": formula,
        "roll": roll,
    }


def check_pain_thresholds(current_lep: int, max_lep: int) -> int:
    """Ermittelt die Schmerzstufe basierend auf aktuellem und maximalem LeP.

    Schmerzstufen (Zustand Schmerz):
    - > 75% max LeP: Stufe 0 (kein Schmerz)
    - <= 75% max LeP: Stufe 1
    - <= 50% max LeP: Stufe 2
    - <= 25% max LeP: Stufe 3
    - <= 5 LeP:       Stufe 4 (Todesschwelle)

    Args:
        current_lep: Aktuelle Lebenspunkte.
        max_lep: Maximale Lebenspunkte.

    Returns:
        Schmerzstufe (0-4).
    """
    if max_lep <= 0:
        return 4

    if current_lep <= 5:
        return 4

    ratio = current_lep / max_lep

    if ratio <= 0.25:
        return 3
    elif ratio <= 0.50:
        return 2
    elif ratio <= 0.75:
        return 1
    else:
        return 0


def check_death(current_lep: int, ko: int) -> dict:
    """Prüft ob ein Charakter sterbend oder tot ist.

    Regeln:
    - LeP > 0: Am Leben
    - LeP <= 0: Sterbend (Handlungsunfähig, braucht Heilung)
    - LeP <= -KO: Tod

    Args:
        current_lep: Aktuelle Lebenspunkte.
        ko: Konstitution des Charakters.

    Returns:
        dict mit:
            alive (bool): Charakter lebt (LeP > 0)
            dying (bool): Charakter ist sterbend (LeP <= 0, aber > -KO)
            dead (bool): Charakter ist tot (LeP <= -KO)
            current_lep (int): Aktuelle Lebenspunkte
    """
    dead = current_lep <= -ko
    dying = current_lep <= 0 and not dead
    alive = current_lep > 0

    return {
        "alive": alive,
        "dying": dying,
        "dead": dead,
        "current_lep": current_lep,
    }

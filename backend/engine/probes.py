"""
DSA5 Proben-Mechanik (Probe Resolution)

Implementiert die beiden Probenarten des DSA5-Regelwerks:
- 1W20-Probe (Eigenschaftsprobe, Kampfprobe)
- 3W20-Probe (Talentprobe, Zauberprobe, Liturgieprobe)

Alle Funktionen sind reine Funktionen ohne Seiteneffekte.
"""

from __future__ import annotations

import math
from typing import Optional


def resolve_1w20_probe(
    target_value: int,
    roll: int,
    modifiers: Optional[list[dict]] = None,
    confirmation_roll: Optional[int] = None,
) -> dict:
    """Löst eine 1W20-Probe auf (Eigenschaftsprobe / Kampfprobe).

    Regeln:
    - Wurf <= effektiver Zielwert: Erfolg
    - Wurf von 1: Kritischer Erfolg (Bestätigungswurf nötig)
    - Wurf von 20: Patzer (Bestätigungswurf nötig)

    Args:
        target_value: Zielwert der Probe (z.B. Eigenschaftswert, AT, PA).
        roll: Würfelergebnis (1-20).
        modifiers: Liste von Modifikatoren. Jeder: {source: str, value: int}.
            Positive Werte erleichtern, negative erschweren.
        confirmation_roll: Bestätigungswurf (1-20) für Kritisch/Patzer.
            Wenn None, wird Kritisch/Patzer als unbestätigt gewertet.

    Returns:
        dict mit:
            success (bool): Probe bestanden
            roll (int): Würfelergebnis
            effective_target (int): Effektiver Zielwert nach Modifikatoren
            critical (bool): Bestätigter kritischer Erfolg
            patzer (bool): Bestätigter Patzer
            critical_unconfirmed (bool): Unbestätigter kritischer Erfolg
            patzer_unconfirmed (bool): Unbestätigter Patzer
            confirmation_roll (int|None): Bestätigungswurf
            modifiers_applied (list[dict]): Angewandte Modifikatoren
    """
    if modifiers is None:
        modifiers = []

    total_modifier = sum(m.get("value", 0) for m in modifiers)
    effective_target = target_value + total_modifier

    # Grundlegende Erfolgsberechnung
    # Eine 1 ist immer ein Erfolg (vor Kritisch-Check), eine 20 immer ein Misserfolg
    if roll == 1:
        base_success = True
    elif roll == 20:
        base_success = False
    else:
        base_success = roll <= effective_target

    critical = False
    patzer = False
    critical_unconfirmed = False
    patzer_unconfirmed = False

    # Kritischer Erfolg: Wurf von 1
    if roll == 1:
        if confirmation_roll is not None:
            if confirmation_roll <= effective_target:
                critical = True
            else:
                critical_unconfirmed = True
        else:
            critical_unconfirmed = True

    # Patzer: Wurf von 20
    if roll == 20:
        if confirmation_roll is not None:
            if confirmation_roll > effective_target:
                patzer = True
            else:
                patzer_unconfirmed = True
        else:
            patzer_unconfirmed = True

    # Bei bestätigtem Kritisch ist es immer ein Erfolg
    # Bei bestätigtem Patzer ist es immer ein Misserfolg
    # Bei unbestätigtem Kritisch: normaler Erfolg (roll 1 <= target immer)
    # Bei unbestätigtem Patzer: normaler Misserfolg (roll 20 > target meist)
    success = base_success or critical

    return {
        "success": success,
        "roll": roll,
        "effective_target": effective_target,
        "critical": critical,
        "patzer": patzer,
        "critical_unconfirmed": critical_unconfirmed,
        "patzer_unconfirmed": patzer_unconfirmed,
        "confirmation_roll": confirmation_roll,
        "modifiers_applied": modifiers,
    }


def resolve_3w20_probe(
    attributes: list[int],
    fw: int,
    rolls: list[int],
    difficulty: int = 0,
    modifiers: Optional[list[dict]] = None,
) -> dict:
    """Löst eine 3W20-Probe auf (Talentprobe / Zauberprobe / Liturgieprobe).

    Regeln:
    - 3 Eigenschaften, je ein W20-Wurf dagegen
    - Erschwernis/Erleichterung wird auf JEDEN Eigenschaftswert angewendet
    - FW (Fertigkeitswert) dient als Punktepool
    - Für jeden Wurf > modifizierter Eigenschaftswert: Differenz wird von FW abgezogen
    - Wenn FW >= 0: Erfolg, verbleibende FW = FP* (Fertigkeitspunkte übrig)
    - QS = ceil(FP* / 3), mindestens 1 bei Erfolg, maximal 6

    Kritisch/Patzer:
    - Drei 1en: Spektakulärer kritischer Erfolg (automatisch QS 6)
    - Zwei 1en: Bestätigung wenn dritter Wurf <= modifizierter Eigenschaftswert → Kritisch
    - Zwei 20en: Bestätigung wenn dritter Wurf > modifizierter Eigenschaftswert → Patzer
    - Drei 20en: Spektakulärer Patzer

    Args:
        attributes: Liste von 3 Eigenschaftswerten [z.B. MU, KL, IN].
        fw: Fertigkeitswert (Punktepool).
        rolls: Liste von 3 Würfelergebnissen (je 1-20).
        difficulty: Erschwernis (negativ) oder Erleichterung (positiv).
            Wird auf jeden Eigenschaftswert addiert. FW bleibt unverändert.
        modifiers: Zusätzliche Modifikatoren. Jeder: {source: str, value: int}.

    Returns:
        dict mit:
            success (bool): Probe bestanden
            rolls (list[int]): Würfelergebnisse
            attributes (list[int]): Ursprüngliche Eigenschaftswerte
            modified_attributes (list[int]): Modifizierte Eigenschaftswerte
            fw (int): Ursprünglicher Fertigkeitswert
            difficulty (int): Angewandte Erschwernis/Erleichterung
            fp_remaining (int): Verbleibende Fertigkeitspunkte (FP*)
            qs (int): Qualitätsstufe (0 bei Misserfolg)
            critical (bool): Kritischer Erfolg
            patzer (bool): Patzer
            spectacular_critical (bool): Spektakulärer kritischer Erfolg (drei 1en)
            spectacular_patzer (bool): Spektakulärer Patzer (drei 20en)
            detail (list[dict]): Pro-Würfel-Aufschlüsselung
            modifiers_applied (list[dict]): Angewandte Modifikatoren
    """
    if len(attributes) != 3:
        raise ValueError("Genau 3 Eigenschaftswerte erforderlich")
    if len(rolls) != 3:
        raise ValueError("Genau 3 Würfelergebnisse erforderlich")

    if modifiers is None:
        modifiers = []

    # Gesamtmodifikator berechnen (zusätzlich zur difficulty)
    extra_modifier = sum(m.get("value", 0) for m in modifiers)
    total_difficulty = difficulty + extra_modifier

    # Modifizierte Eigenschaftswerte (Erschwernis/Erleichterung anwenden)
    # Eigenschaftswerte können durch Modifikatoren unter 0 fallen
    modified_attributes = [attr + total_difficulty for attr in attributes]

    # Kritisch/Patzer-Erkennung
    ones_count = rolls.count(1)
    twenties_count = rolls.count(20)

    spectacular_critical = ones_count == 3
    spectacular_patzer = twenties_count == 3

    # Zwei 1en: Bestätigung durch dritten Wurf
    critical = False
    if spectacular_critical:
        critical = True
    elif ones_count == 2:
        # Finde den Wurf, der keine 1 ist, und prüfe ob er <= modifiziertem Eigenschaftswert
        for i in range(3):
            if rolls[i] != 1:
                if rolls[i] <= modified_attributes[i]:
                    critical = True
                break

    # Zwei 20en: Bestätigung durch dritten Wurf
    patzer = False
    if spectacular_patzer:
        patzer = True
    elif twenties_count == 2:
        # Finde den Wurf, der keine 20 ist, und prüfe ob er > modifiziertem Eigenschaftswert
        for i in range(3):
            if rolls[i] != 20:
                if rolls[i] > modified_attributes[i]:
                    patzer = True
                break

    # Pro-Würfel-Berechnung
    fp_used = 0
    detail = []
    for i in range(3):
        attr_val = modified_attributes[i]
        die_roll = rolls[i]
        diff = die_roll - attr_val
        points_needed = max(0, diff)  # Nur positive Differenz kostet FP
        detail.append({
            "attribute_original": attributes[i],
            "attribute_modified": attr_val,
            "roll": die_roll,
            "difference": diff,
            "points_needed": points_needed,
        })
        fp_used += points_needed

    fp_remaining = fw - fp_used

    # Erfolgsberechnung
    if patzer:
        success = False
        fp_remaining = min(fp_remaining, 0)  # Bei Patzer immer Misserfolg
    elif critical:
        success = True
        fp_remaining = max(fp_remaining, 1)  # Bei Kritisch mindestens 1 FP*
    else:
        success = fp_remaining >= 0

    # FP* kann nicht höher als FW sein
    if success:
        fp_remaining = min(fp_remaining, fw)
        # FP* ist mindestens 1 bei Erfolg (man hat mindestens 1 FP* geschafft)
        fp_remaining = max(fp_remaining, 1) if fw > 0 else max(fp_remaining, 0)

    # QS berechnen
    if success:
        if spectacular_critical or critical:
            qs = 6 if spectacular_critical else max(calculate_qs(fp_remaining), 1)
        else:
            qs = calculate_qs(fp_remaining)
    else:
        qs = 0

    return {
        "success": success,
        "rolls": rolls,
        "attributes": attributes,
        "modified_attributes": modified_attributes,
        "fw": fw,
        "difficulty": difficulty,
        "fp_remaining": fp_remaining if success else fp_remaining,
        "qs": qs,
        "critical": critical,
        "patzer": patzer,
        "spectacular_critical": spectacular_critical,
        "spectacular_patzer": spectacular_patzer,
        "detail": detail,
        "modifiers_applied": modifiers,
    }


def calculate_qs(fp_remaining: int) -> int:
    """Berechnet die Qualitätsstufe (QS) aus den verbleibenden Fertigkeitspunkten (FP*).

    Zuordnung:
        1-3  → QS 1
        4-6  → QS 2
        7-9  → QS 3
        10-12 → QS 4
        13-15 → QS 5
        16+  → QS 6

    Args:
        fp_remaining: Verbleibende Fertigkeitspunkte (FP*).

    Returns:
        Qualitätsstufe (1-6). Bei fp_remaining <= 0 wird 0 zurückgegeben.
    """
    if fp_remaining <= 0:
        return 0

    qs = math.ceil(fp_remaining / 3)
    return min(qs, 6)

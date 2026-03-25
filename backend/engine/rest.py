"""
DSA5 Rastsystem (Rest and Regeneration)

Implementiert die Regeneration von LeP, AsP und KaP während Rasten,
Proviantverbrauch und Zustandstimer.

Alle Funktionen sind reine Funktionen ohne Seiteneffekte.
"""

from __future__ import annotations

import copy
import math
from typing import Optional


def calculate_rest(
    characters: list[dict],
    duration_hours: int,
    provisions: Optional[dict] = None,
) -> list[dict]:
    """Berechnet die Ergebnisse einer Rast für alle Charaktere.

    Ablauf pro Charakter:
    1. LeP-Regeneration (bei >= 6 Stunden Rast)
    2. AsP-Regeneration (bei >= 6 Stunden Rast, wenn magisch)
    3. KaP-Regeneration (bei >= 6 Stunden Rast, wenn geweiht)
    4. Proviantverbrauch
    5. Gift-/Krankheitsprogression
    6. Zustandstimer-Ticks

    Regeneration nur bei mindestens 6 Stunden Rast (kurze Rast).
    Volle Regeneration bei 8+ Stunden Rast (lange Rast / Nachtruhe).

    Args:
        characters: Liste von Charakterdaten. Jeder benötigt:
            name (str): Name
            current_lep (int): Aktuelle LeP
            max_lep (int): Maximale LeP
            ko (int): Konstitution (für LeP-Regeneration)
            current_asp (int, optional): Aktuelle AsP
            max_asp (int, optional): Maximale AsP
            current_kap (int, optional): Aktuelle KaP
            max_kap (int, optional): Maximale KaP
            vorteile (list[str], optional): Vorteile
            nachteile (list[str], optional): Nachteile
            conditions (dict, optional): Aktive Zustände
            active_poisons (list[dict], optional): Aktive Gifte
            active_diseases (list[dict], optional): Aktive Krankheiten
        duration_hours: Rastdauer in Stunden.
        provisions: Proviant-Informationen:
            available (bool): Ob Proviant vorhanden
            quality (str): 'schlecht', 'normal', 'gut'

    Returns:
        Liste von Ergebnissen pro Charakter:
            name (str): Name
            lep_regenerated (int): Regenerierte LeP
            asp_regenerated (int): Regenerierte AsP
            kap_regenerated (int): Regenerierte KaP
            new_lep (int): Neue LeP
            new_asp (int): Neue AsP
            new_kap (int): Neue KaP
            provisions_consumed (bool): Proviant verbraucht
            condition_changes (list[dict]): Zustandsänderungen
            poison_effects (list[dict]): Gift-Effekte
            disease_effects (list[dict]): Krankheits-Effekte
    """
    if provisions is None:
        provisions = {"available": True, "quality": "normal"}

    results = []

    for char in characters:
        char_name = char.get("name", "Unbekannt")
        current_lep = char.get("current_lep", 0)
        max_lep = char.get("max_lep", 0)
        current_asp = char.get("current_asp", 0)
        max_asp = char.get("max_asp", 0)
        current_kap = char.get("current_kap", 0)
        max_kap = char.get("max_kap", 0)

        lep_regen = 0
        asp_regen = 0
        kap_regen = 0
        condition_changes = []
        poison_effects = []
        disease_effects = []

        # Regeneration nur bei ausreichender Rast (>= 6 Stunden)
        if duration_hours >= 6:
            # LeP-Regeneration
            lep_result = calculate_lep_regeneration(char, duration_hours=duration_hours)
            lep_regen = lep_result.get("lep_regenerated", 0)

            # Modifikation durch Proviant
            if not provisions.get("available", True):
                lep_regen = max(0, lep_regen - 1)
            elif provisions.get("quality") == "gut":
                lep_regen += 1
            elif provisions.get("quality") == "schlecht":
                lep_regen = max(0, lep_regen - 1)

            # AsP-Regeneration (nur für Magiekundige)
            if max_asp > 0:
                asp_regen = _calculate_asp_regeneration(char, duration_hours)

            # KaP-Regeneration (nur für Geweihte)
            if max_kap > 0:
                kap_regen = _calculate_kap_regeneration(char, duration_hours)

        # Neue Werte berechnen (nicht über Maximum)
        new_lep = min(current_lep + lep_regen, max_lep)
        new_asp = min(current_asp + asp_regen, max_asp)
        new_kap = min(current_kap + kap_regen, max_kap)

        # Zustandstimer verarbeiten
        conditions = char.get("conditions", {})
        for cond_name, cond_data in conditions.items():
            if isinstance(cond_data, dict):
                timer = cond_data.get("timer_hours")
                if timer is not None and timer > 0:
                    remaining = max(0, timer - duration_hours)
                    if remaining == 0:
                        condition_changes.append({
                            "condition": cond_name,
                            "change": "expired",
                            "detail": f"{cond_name} ist abgelaufen.",
                        })
                    else:
                        condition_changes.append({
                            "condition": cond_name,
                            "change": "timer_reduced",
                            "remaining_hours": remaining,
                        })

        # Gift-Progression
        for poison in char.get("active_poisons", []):
            poison_effects.append({
                "name": poison.get("name", "Unbekanntes Gift"),
                "effect": "progression",
                "detail": f"Gift wirkt weiter. Intervall prüfen.",
            })

        # Krankheits-Progression
        for disease in char.get("active_diseases", []):
            disease_effects.append({
                "name": disease.get("name", "Unbekannte Krankheit"),
                "effect": "progression",
                "detail": f"Krankheit schreitet voran. Symptome prüfen.",
            })

        results.append({
            "name": char_name,
            "lep_regenerated": lep_regen,
            "asp_regenerated": asp_regen,
            "kap_regenerated": kap_regen,
            "new_lep": new_lep,
            "new_asp": new_asp,
            "new_kap": new_kap,
            "provisions_consumed": duration_hours >= 6,
            "condition_changes": condition_changes,
            "poison_effects": poison_effects,
            "disease_effects": disease_effects,
        })

    return results


def calculate_lep_regeneration(
    character: dict,
    roll: Optional[int] = None,
    duration_hours: int = 8,
) -> dict:
    """Berechnet die LeP-Regeneration eines Charakters.

    Basis-Regeneration:
    - Kurze Rast (6-7 Stunden): 1W6 LeP
    - Lange Rast (8+ Stunden): 1W6 LeP
    - Weniger als 6 Stunden: Keine Regeneration

    Modifikatoren:
    - Vorteil 'Schnelle Heilung I/II/III': +1/+2/+3
    - Nachteil 'Langsame Heilung I/II/III': -1/-2/-3
    - KO-Bonus: Wenn KO >= 15 → +1, >= 20 → +2

    Args:
        character: Charakterdaten mit ko, vorteile, nachteile.
        roll: Würfelergebnis (1W6, 1-6). Wenn None, wird Durchschnitt (3) verwendet.
        duration_hours: Rastdauer in Stunden.

    Returns:
        dict mit:
            lep_regenerated (int): Regenerierte LeP (mindestens 0)
            roll (int|None): Verwendeter Würfelwurf
            modifiers (list[dict]): Angewandte Modifikatoren
    """
    if duration_hours < 6:
        return {
            "lep_regenerated": 0,
            "roll": None,
            "modifiers": [{"source": "Zu kurze Rast", "value": 0}],
        }

    base = roll if roll is not None else 3  # Durchschnitt 1W6
    modifiers_applied = []

    vorteile = character.get("vorteile", [])
    nachteile = character.get("nachteile", [])
    ko = character.get("ko", 10)

    modifier_total = 0

    # Schnelle Heilung
    for level in [3, 2, 1]:
        if f"Schnelle Heilung {level}" in vorteile or f"Schnelle Heilung {'I' * level}" in vorteile:
            modifier_total += level
            modifiers_applied.append({"source": f"Schnelle Heilung {level}", "value": level})
            break

    # Langsame Heilung
    for level in [3, 2, 1]:
        if f"Langsame Heilung {level}" in nachteile or f"Langsame Heilung {'I' * level}" in nachteile:
            modifier_total -= level
            modifiers_applied.append({"source": f"Langsame Heilung {level}", "value": -level})
            break

    # KO-Bonus
    if ko >= 20:
        modifier_total += 2
        modifiers_applied.append({"source": "Hohe KO (20+)", "value": 2})
    elif ko >= 15:
        modifier_total += 1
        modifiers_applied.append({"source": "Hohe KO (15+)", "value": 1})

    lep_regen = max(0, base + modifier_total)

    return {
        "lep_regenerated": lep_regen,
        "roll": roll,
        "modifiers": modifiers_applied,
    }


def _calculate_asp_regeneration(character: dict, duration_hours: int) -> int:
    """Berechnet die AsP-Regeneration.

    Basis: 1W6 AsP bei 8+ Stunden Rast.
    Bei 6-7 Stunden: 1W3 AsP (halber Würfel).
    Modifiziert durch Vorteile/Nachteile.

    Args:
        character: Charakterdaten.
        duration_hours: Rastdauer in Stunden.

    Returns:
        Regenerierte AsP (mindestens 0).
    """
    if duration_hours < 6:
        return 0

    # Basis-Regeneration
    if duration_hours >= 8:
        base = 3  # Durchschnitt 1W6
    else:
        base = 2  # Durchschnitt 1W3

    modifier = 0
    vorteile = character.get("vorteile", [])
    nachteile = character.get("nachteile", [])

    # Astrale Regeneration
    for level in [3, 2, 1]:
        sf_names = [f"Astrale Regeneration {level}", f"Astrale Regeneration {'I' * level}"]
        if any(sf in vorteile for sf in sf_names):
            modifier += level
            break

    return max(0, base + modifier)


def _calculate_kap_regeneration(character: dict, duration_hours: int) -> int:
    """Berechnet die KaP-Regeneration.

    Basis: 1W6 KaP bei 8+ Stunden Rast.
    Bei 6-7 Stunden: 1W3 KaP (halber Würfel).
    Modifiziert durch Vorteile/Nachteile.

    Args:
        character: Charakterdaten.
        duration_hours: Rastdauer in Stunden.

    Returns:
        Regenerierte KaP (mindestens 0).
    """
    if duration_hours < 6:
        return 0

    if duration_hours >= 8:
        base = 3  # Durchschnitt 1W6
    else:
        base = 2  # Durchschnitt 1W3

    modifier = 0
    vorteile = character.get("vorteile", [])

    # Karmale Regeneration
    for level in [3, 2, 1]:
        sf_names = [f"Karmale Regeneration {level}", f"Karmale Regeneration {'I' * level}"]
        if any(sf in vorteile for sf in sf_names):
            modifier += level
            break

    return max(0, base + modifier)

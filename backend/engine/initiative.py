"""
DSA5 Initiativ-System (Initiative Calculation and Sorting)

Implementiert die Initiativberechnung und -sortierung gemäß dem DSA5-Regelwerk.
INI = INI-Basis + 1W6 + Modifikatoren

Alle Funktionen sind reine Funktionen ohne Seiteneffekte.
"""

from __future__ import annotations

from typing import Optional


def calculate_initiative(
    ini_basis: int,
    roll: int,
    modifiers: Optional[list[dict]] = None,
) -> dict:
    """Berechnet die Initiative eines Kämpfers.

    Formel: INI = INI-Basis + 1W6 + Summe aller Modifikatoren

    INI-Basis = (MU + GE) / 2 (wird bei Charaktererstellung berechnet).
    Der Würfelwurf ist 1W6.

    Args:
        ini_basis: INI-Basiswert des Kämpfers.
        roll: Würfelergebnis (1W6, also 1-6).
        modifiers: Liste von Modifikatoren.
            Jeder: {source: str, value: int}
            z.B. {source: 'Kampfreflexe', value: +4}
            oder {source: 'Betäubung 2', value: -2}

    Returns:
        dict mit:
            initiative (int): Berechnete Initiative (mindestens 0)
            ini_basis (int): INI-Basiswert
            roll (int): Würfelergebnis
            modifiers_applied (list[dict]): Angewandte Modifikatoren
            total_modifier (int): Summe aller Modifikatoren
    """
    if modifiers is None:
        modifiers = []

    total_modifier = sum(m.get("value", 0) for m in modifiers)
    initiative = max(0, ini_basis + roll + total_modifier)

    return {
        "initiative": initiative,
        "ini_basis": ini_basis,
        "roll": roll,
        "modifiers_applied": modifiers,
        "total_modifier": total_modifier,
    }


def sort_initiative(combatants: list[dict]) -> list[dict]:
    """Sortiert Kämpfer nach Initiative in absteigender Reihenfolge.

    Sortierregeln:
    1. Höchste Initiative zuerst
    2. Bei Gleichstand: Höherer INI-Basiswert zuerst
    3. Bei weiterem Gleichstand: Alphabetisch nach Name

    Args:
        combatants: Liste von Kämpfern. Jeder benötigt:
            name (str): Name des Kämpfers
            initiative (int): Berechnete Initiative
            ini_basis (int): INI-Basiswert

    Returns:
        Sortierte Liste der Kämpfer (Kopie, Original bleibt unverändert).
    """
    return sorted(
        combatants,
        key=lambda c: (
            c.get("initiative", 0),
            c.get("ini_basis", 0),
            # Alphabetisch aufsteigend → negativer Vergleich für absteigend
        ),
        reverse=True,
    )


def resolve_initiative_tie(combatants: list[dict]) -> list[dict]:
    """Löst INI-Gleichstände auf, wobei bei exakt gleichen Werten
    alphabetisch sortiert wird (als letzte Tiebreaker-Regel).

    Dies ist eine spezialisiertere Version von sort_initiative, die
    bei exakten Gleichständen auch den Namen berücksichtigt.

    Args:
        combatants: Liste von Kämpfern mit initiative, ini_basis, name.

    Returns:
        Sortierte Liste.
    """
    return sorted(
        combatants,
        key=lambda c: (
            -c.get("initiative", 0),
            -c.get("ini_basis", 0),
            c.get("name", ""),
        ),
    )

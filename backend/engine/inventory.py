"""
DSA5 Inventarsystem (Inventory, Weight and Transfer Rules)

Implementiert Tragkraftberechnung, Gewichtsermittlung, Belastungsstufen
und Transfervalidierung gemäß dem DSA5-Regelwerk.

Gewichtseinheit: Stein (1 Stein = ca. 1 kg)

Alle Funktionen sind reine Funktionen ohne Seiteneffekte.
"""

from __future__ import annotations

from typing import Optional


def calculate_carry_capacity(kk: int) -> float:
    """Berechnet die Tragkraft eines Charakters.

    Formel: Tragkraft = KK × 2 (in Stein)

    Args:
        kk: Körperkraft des Charakters.

    Returns:
        Tragkraft in Stein.
    """
    return float(max(0, kk * 2))


def calculate_total_weight(items: list[dict]) -> float:
    """Berechnet das Gesamtgewicht aller Gegenstände.

    Args:
        items: Liste von Gegenständen. Jeder benötigt:
            gewicht (float): Gewicht in Stein
            menge (int, optional): Anzahl (Standard: 1)

    Returns:
        Gesamtgewicht in Stein.
    """
    total = 0.0
    for item in items:
        weight = item.get("gewicht", 0.0)
        quantity = item.get("menge", 1)
        total += weight * quantity
    return total


def get_belastung_from_weight(total_weight: float, capacity: float) -> int:
    """Berechnet die Belastungsstufe basierend auf Gewicht und Tragkraft.

    Regeln:
    - Gewicht <= Tragkraft: Belastung 0
    - Jede 25% über der Tragkraft: +1 Belastung
    - Beispiel: Tragkraft 30, Gewicht 45 = 50% über → Belastung 2

    Maximale Tragkraft ist das Doppelte der normalen Tragkraft.
    Darüber kann der Charakter sich nicht mehr bewegen.

    Args:
        total_weight: Gesamtgewicht in Stein.
        capacity: Tragkraft in Stein.

    Returns:
        Belastungsstufe (0+).
    """
    if capacity <= 0:
        return 4 if total_weight > 0 else 0

    if total_weight <= capacity:
        return 0

    excess = total_weight - capacity
    # Jede 25% der Tragkraft über dem Limit = +1 Belastung
    quarter = capacity * 0.25
    if quarter <= 0:
        return 4

    belastung = int(excess / quarter)
    # Aufrunden wenn Rest vorhanden
    if excess % quarter > 0:
        belastung += 1

    return belastung


def validate_transfer(
    item: dict,
    from_inventory: list[dict],
    to_inventory: list[dict],
    in_combat: bool = False,
) -> dict:
    """Prüft ob ein Gegenstandstransfer gültig ist.

    Regeln:
    - Gegenstand muss im Quell-Inventar vorhanden sein
    - Im Kampf: Gegenstände aufheben/ablegen kostet eine Aktion
    - Freie Aktionen: Kleine Gegenstände (< 0.5 Stein) fallen lassen
    - Aktion: Gegenstände aus Rucksack/Gürtel nehmen oder aufheben

    Args:
        item: Gegenstand zum Transfer.
            id (str): Gegenstand-ID
            name (str): Name
            gewicht (float): Gewicht in Stein
        from_inventory: Quell-Inventar (Liste von Gegenständen).
        to_inventory: Ziel-Inventar (Liste von Gegenständen).
        in_combat: Ob der Transfer im Kampf stattfindet.

    Returns:
        dict mit:
            valid (bool): Transfer gültig
            action_cost (str|None): 'freie_aktion' oder 'aktion' oder None
            reason (str|None): Grund bei ungültigem Transfer
    """
    item_id = item.get("id")
    item_name = item.get("name", "Unbekannt")

    # Prüfung ob Gegenstand im Quell-Inventar vorhanden
    found = False
    for inv_item in from_inventory:
        if inv_item.get("id") == item_id:
            found = True
            break

    if not found:
        return {
            "valid": False,
            "action_cost": None,
            "reason": f"'{item_name}' ist nicht im Quell-Inventar vorhanden.",
        }

    # Aktionskosten im Kampf
    action_cost = None
    if in_combat:
        weight = item.get("gewicht", 0.0)
        item_type = item.get("typ", "")

        # Waffe fallen lassen ist eine freie Aktion
        if item_type == "drop":
            action_cost = "freie_aktion"
        # Kleine leichte Gegenstände: freie Aktion
        elif weight < 0.5:
            action_cost = "freie_aktion"
        else:
            # Standardmäßig eine Aktion
            action_cost = "aktion"

    return {
        "valid": True,
        "action_cost": action_cost,
        "reason": None,
    }

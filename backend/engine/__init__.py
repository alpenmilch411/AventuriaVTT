"""
DSA5 Rules Engine — AventuriaVTT

Reine Funktionen zur Regelauflösung des DSA5-Systems.
Keine Seiteneffekte, keine Datenbankzugriffe, keine WebSocket-Aufrufe.

Module:
    probes      - 1W20- und 3W20-Probenauflösung
    combat      - Angriffs- und Verteidigungsauflösung, Manöver
    damage      - Schadensberechnung, Schmerzstufem, Todescheck
    initiative  - Initiativberechnung und -sortierung
    conditions  - Zustände (Stufe I-IV) und Status-Effekte
    magic       - Zauberproben und Effektberechnung (AsP)
    liturgies   - Liturgieproben und Effektberechnung (KaP)
    movement    - Bewegung, A*-Wegfindung, Passierschlag
    inventory   - Tragkraft, Gewicht, Belastung, Transfers
    rest        - Regeneration (LeP/AsP/KaP), Rasten
    leveling    - AP-Kosten, Voraussetzungen, Steigerung
    modifiers   - Modifikator-Aggregation, Umgebungs-/Fernkampfmodifikatoren
"""

from . import (
    combat,
    conditions,
    damage,
    initiative,
    inventory,
    leveling,
    liturgies,
    magic,
    modifiers,
    movement,
    probes,
    rest,
)

__all__ = [
    "probes",
    "combat",
    "damage",
    "initiative",
    "conditions",
    "magic",
    "liturgies",
    "movement",
    "inventory",
    "rest",
    "leveling",
    "modifiers",
]

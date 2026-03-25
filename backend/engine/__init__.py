"""
DSA5 Rules Engine — AventuriaVTT

Reine Funktionen zur Regelauflösung des DSA5-Systems.
Keine Seiteneffekte, keine Datenbankzugriffe, keine WebSocket-Aufrufe.

Module:
    leveling    - AP-Kosten, Voraussetzungen, Steigerung
"""

from . import leveling

__all__ = [
    "leveling",
]

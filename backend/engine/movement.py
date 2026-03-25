"""
DSA5 Bewegungssystem (Movement and Pathfinding)

Implementiert Bewegungsberechnung, A*-Wegfindung, Passierschlag-Prüfung
und Entfernungsberechnung auf dem Kampfraster.

Alle Funktionen sind reine Funktionen ohne Seiteneffekte.
"""

from __future__ import annotations

import heapq
import math
from typing import Optional


def calculate_movement_range(
    gs: int,
    conditions: Optional[dict] = None,
    belastung: int = 0,
) -> int:
    """Berechnet die verfügbare Bewegungsreichweite (in Schritt) pro Kampfrunde.

    Formel: Effektive GS = GS - Belastung - Zustandsabzüge
    Minimale GS ist 0 (kann nicht negativ werden).

    Args:
        gs: Grundgeschwindigkeit (GS) des Charakters.
        conditions: Zustandsdict (wie in conditions.py).
            Relevante Zustände: Schmerz, Betäubung, Furcht, Belastung.
        belastung: Belastungsstufe (z.B. durch Übergewicht).

    Returns:
        Effektive Bewegungsreichweite in Schritt (mindestens 0).
    """
    if conditions is None:
        conditions = {}

    gs_reduction = belastung

    # GS-Abzüge aus Zuständen berechnen
    gs_reducing_conditions = ["Schmerz", "Betäubung", "Furcht", "Belastung"]
    for cond_name in gs_reducing_conditions:
        cond_data = conditions.get(cond_name)
        if cond_data and isinstance(cond_data, dict):
            level = cond_data.get("total", 0)
            gs_reduction += level

    return max(0, gs - gs_reduction)


def find_path(
    start: tuple[int, int],
    end: tuple[int, int],
    walls: list[tuple[int, int] | tuple[tuple[int, int], tuple[int, int]]],
    difficult_terrain: list[tuple[int, int]],
    grid_size: tuple[int, int],
) -> dict:
    """A*-Wegfindung auf dem Kampfraster.

    Findet den kürzesten Weg von Start zu Ziel unter Berücksichtigung von
    Wänden (unpassierbar) und schwierigem Gelände (doppelte Kosten).

    Bewegung ist in 8 Richtungen möglich (orthogonal + diagonal).
    Diagonale Bewegung kostet 1.5 Schritt (aufgerundet bei Gesamtkosten).

    Args:
        start: Startposition (x, y).
        end: Zielposition (x, y).
        walls: Liste von unpassierbaren Feldern. Kann sein:
            - (x, y): Einzelnes blockiertes Feld
            - ((x1, y1), (x2, y2)): Wand zwischen zwei Feldern
        difficult_terrain: Liste von Feldern mit schwierigem Gelände (x, y).
        grid_size: Größe des Rasters (breite, höhe).

    Returns:
        dict mit:
            path (list[tuple]): Liste von (x, y)-Positionen des Pfads
            cost (int): Gesamtkosten in Schritt (aufgerundet)
            valid (bool): Ob ein gültiger Pfad gefunden wurde
    """
    width, height = grid_size

    # Validierung
    if not (0 <= start[0] < width and 0 <= start[1] < height):
        return {"path": [], "cost": 0, "valid": False}
    if not (0 <= end[0] < width and 0 <= end[1] < height):
        return {"path": [], "cost": 0, "valid": False}
    if start == end:
        return {"path": [start], "cost": 0, "valid": True}

    # Wände aufbereiten
    blocked_cells: set[tuple[int, int]] = set()
    blocked_edges: set[tuple[tuple[int, int], tuple[int, int]]] = set()

    for wall in walls:
        if isinstance(wall, tuple) and len(wall) == 2:
            if isinstance(wall[0], tuple):
                # Wand zwischen zwei Feldern
                blocked_edges.add((wall[0], wall[1]))
                blocked_edges.add((wall[1], wall[0]))
            else:
                # Blockiertes Feld
                blocked_cells.add(wall)

    difficult_set = set(difficult_terrain)

    # Prüfung ob Start oder Ziel blockiert
    if start in blocked_cells or end in blocked_cells:
        return {"path": [], "cost": 0, "valid": False}

    # 8 Bewegungsrichtungen: (dx, dy, Kosten)
    # Orthogonal: Kosten 1.0, Diagonal: Kosten 1.5
    directions = [
        (0, 1, 1.0),   # Norden
        (1, 0, 1.0),   # Osten
        (0, -1, 1.0),  # Süden
        (-1, 0, 1.0),  # Westen
        (1, 1, 1.5),   # Nordost
        (1, -1, 1.5),  # Südost
        (-1, 1, 1.5),  # Nordwest
        (-1, -1, 1.5), # Südwest
    ]

    def heuristic(a: tuple[int, int], b: tuple[int, int]) -> float:
        """Oktile Distanz als Heuristik für A*."""
        dx = abs(a[0] - b[0])
        dy = abs(a[1] - b[1])
        return max(dx, dy) + 0.5 * min(dx, dy)

    # A* Algorithmus
    open_set: list[tuple[float, tuple[int, int]]] = [(0.0, start)]
    came_from: dict[tuple[int, int], tuple[int, int]] = {}
    g_score: dict[tuple[int, int], float] = {start: 0.0}

    while open_set:
        current_f, current = heapq.heappop(open_set)

        if current == end:
            # Pfad rekonstruieren
            path = []
            node = end
            while node in came_from:
                path.append(node)
                node = came_from[node]
            path.append(start)
            path.reverse()
            return {
                "path": path,
                "cost": math.ceil(g_score[end]),
                "valid": True,
            }

        for dx, dy, base_cost in directions:
            neighbor = (current[0] + dx, current[1] + dy)

            # Rasterprüfung
            if not (0 <= neighbor[0] < width and 0 <= neighbor[1] < height):
                continue

            # Blockiertes Feld
            if neighbor in blocked_cells:
                continue

            # Blockierte Kante
            if (current, neighbor) in blocked_edges:
                continue

            # Schwieriges Gelände: doppelte Kosten
            move_cost = base_cost
            if neighbor in difficult_set:
                move_cost *= 2

            tentative_g = g_score[current] + move_cost

            if tentative_g < g_score.get(neighbor, float("inf")):
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g
                f_score = tentative_g + heuristic(neighbor, end)
                heapq.heappush(open_set, (f_score, neighbor))

    # Kein Pfad gefunden
    return {"path": [], "cost": 0, "valid": False}


def check_passierschlag(
    mover_path: list[tuple[int, int]],
    enemy_positions: list[dict],
    enemy_reach: Optional[list[str]] = None,
) -> list[dict]:
    """Prüft ob eine Bewegung Passierschläge (Gelegenheitsangriffe) auslöst.

    Ein Passierschlag wird ausgelöst, wenn sich ein Kämpfer aus dem
    Kontrollbereich eines Gegners herausbewegt (d.h. er war in Nahkampfreichweite
    und verlässt diese).

    Reichweiten:
    - 'kurz': 1 Feld (angrenzend)
    - 'mittel': 1 Feld (angrenzend, wie kurz im Raster)
    - 'lang': 2 Felder

    Args:
        mover_path: Pfad des sich bewegenden Kämpfers [(x, y), ...].
        enemy_positions: Liste von Gegnern. Jeder:
            {id: str, position: (x, y), reach: str}
        enemy_reach: Veraltet. Reichweiten werden aus enemy_positions gelesen.

    Returns:
        Liste von Passierschlag-Auslösern. Jeder:
            {enemy_id: str, trigger_cell: tuple, can_avoid: bool}
    """
    if len(mover_path) < 2:
        return []

    triggers = []

    for enemy in enemy_positions:
        enemy_id = enemy.get("id", "unknown")
        enemy_pos = enemy.get("position", (0, 0))
        reach = enemy.get("reach", "mittel")

        # Reichweite in Feldern bestimmen
        reach_distance = 1  # Standard: kurz/mittel
        if reach == "lang":
            reach_distance = 2

        # Prüfe ob der Kämpfer den Kontrollbereich verlässt
        was_in_range = False
        trigger_cell = None

        for i, pos in enumerate(mover_path):
            dist = _chebyshev_distance(pos, enemy_pos)
            in_range = dist <= reach_distance

            if in_range:
                was_in_range = True
            elif was_in_range:
                # Verlässt den Kontrollbereich → Passierschlag
                trigger_cell = mover_path[i - 1]  # Letztes Feld in Reichweite
                triggers.append({
                    "enemy_id": enemy_id,
                    "trigger_cell": trigger_cell,
                    "can_avoid": False,  # Standard: kann nicht vermieden werden
                })
                break  # Nur ein Passierschlag pro Gegner

    return triggers


def calculate_distance(pos_a: tuple[int, int], pos_b: tuple[int, int]) -> int:
    """Berechnet die Distanz zwischen zwei Rasterpositionen in Schritt.

    Diagonale Bewegung zählt 1.5 Schritt (aufgerundet bei der Gesamtdistanz).
    Dies entspricht der Chebyshev-Distanz mit Diagonalkorrektur.

    Args:
        pos_a: Position A (x, y).
        pos_b: Position B (x, y).

    Returns:
        Distanz in Schritt (aufgerundet).
    """
    dx = abs(pos_a[0] - pos_b[0])
    dy = abs(pos_a[1] - pos_b[1])

    # Oktile Distanz: gerade Schritte + 1.5 * diagonale Schritte
    diagonal = min(dx, dy)
    straight = max(dx, dy) - diagonal

    distance = straight * 1.0 + diagonal * 1.5
    return math.ceil(distance)


def _chebyshev_distance(a: tuple[int, int], b: tuple[int, int]) -> int:
    """Chebyshev-Distanz (maximale Differenz in x oder y).

    Wird intern für Reichweitenprüfungen verwendet, da im DSA5-Raster
    diagonale Adjazenz als 1 Feld zählt.

    Args:
        a: Position A (x, y).
        b: Position B (x, y).

    Returns:
        Chebyshev-Distanz.
    """
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]))

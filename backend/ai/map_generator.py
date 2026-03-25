"""AI-powered map generation via Claude API.

Generates structured map JSON from text descriptions for the VTT.
The AI is NEVER visible to players — GM only.
"""

import json
import logging
from typing import Optional

import anthropic

from config import get_settings
from ai.prompts import SYSTEM_BASE, MAP_GENERATION_PROMPT

logger = logging.getLogger(__name__)

_NO_API_KEY_MSG = (
    "Kein ANTHROPIC_API_KEY konfiguriert. "
    "Bitte setze den API-Key in der .env-Datei, um KI-Funktionen zu nutzen."
)


def _extract_json(text: str) -> Optional[any]:
    """Robustly extract JSON from a Claude response that may contain markdown fences."""
    text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    if "```" in text:
        start = text.find("```")
        end = text.rfind("```")
        if start != end:
            inner = text[start:end]
            first_newline = inner.find("\n")
            if first_newline != -1:
                inner = inner[first_newline + 1:]
            try:
                return json.loads(inner.strip())
            except json.JSONDecodeError:
                pass

    for open_char, close_char in [("{", "}"), ("[", "]")]:
        start = text.find(open_char)
        end = text.rfind(close_char)
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                continue

    return None


def _validate_map_data(data: dict) -> dict:
    """Ensure required map fields exist with sensible defaults."""
    if "name" not in data:
        data["name"] = "Generierte Karte"

    # Grid config
    grid = data.get("grid_config", {})
    if not isinstance(grid, dict):
        grid = {}
    grid.setdefault("type", "square")
    grid.setdefault("width", 20)
    grid.setdefault("height", 20)
    grid.setdefault("cell_px", 70)
    # Clamp grid dimensions
    grid["width"] = max(5, min(int(grid["width"]), 100))
    grid["height"] = max(5, min(int(grid["height"]), 100))
    data["grid_config"] = grid

    # Ensure list fields exist and are lists
    for list_field in ("walls", "doors", "objects", "terrain", "landmarks"):
        if list_field not in data or not isinstance(data.get(list_field), list):
            data[list_field] = data.get(list_field, [])
            if not isinstance(data[list_field], list):
                data[list_field] = []

    # Lighting
    lighting = data.get("lighting", {})
    if not isinstance(lighting, dict):
        lighting = {}
    lighting.setdefault("ambient", "bright")
    if "sources" not in lighting or not isinstance(lighting.get("sources"), list):
        lighting["sources"] = []
    data["lighting"] = lighting

    # Validate wall segments
    valid_walls = []
    for wall in data.get("walls", []):
        if isinstance(wall, dict) and all(k in wall for k in ("x1", "y1", "x2", "y2")):
            valid_walls.append({
                "x1": int(wall["x1"]),
                "y1": int(wall["y1"]),
                "x2": int(wall["x2"]),
                "y2": int(wall["y2"]),
            })
    data["walls"] = valid_walls

    return data


class MapGenerator:
    """Generate structured map data from text descriptions using Claude."""

    def __init__(self) -> None:
        settings = get_settings()
        self.client: Optional[anthropic.Anthropic] = None
        if settings.ANTHROPIC_API_KEY:
            self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.model = "claude-sonnet-4-20250514"

    def _check_client(self) -> Optional[dict]:
        """Return an error dict if the client is not configured, else None."""
        if self.client is None:
            return {"error": _NO_API_KEY_MSG}
        return None

    async def generate_structured(self, description: str) -> dict:
        """Generate structured map JSON from a text description (Mode 1).

        Args:
            description: Free-text description of the location / dungeon / area.

        Returns:
            A validated dict with keys: ``name``, ``grid_config``, ``walls``,
            ``doors``, ``objects``, ``terrain``, ``lighting``, ``landmarks``.
            On error, returns ``{"error": "..."}`` instead.
        """
        err = self._check_client()
        if err:
            return err

        system = f"{SYSTEM_BASE}\n\n{MAP_GENERATION_PROMPT}"
        user_message = f"Erstelle eine Karte fuer folgende Beschreibung:\n\n{description}"

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=4096,
                system=system,
                messages=[{"role": "user", "content": user_message}],
            )
            raw = response.content[0].text
            parsed = _extract_json(raw)

            if parsed is None or not isinstance(parsed, dict):
                logger.warning("Could not parse JSON from map generation response")
                return {
                    "error": "Konnte kein valides JSON aus der KI-Antwort extrahieren.",
                    "raw_response": raw,
                }

            return _validate_map_data(parsed)
        except anthropic.APIError as exc:
            logger.error("Anthropic API error in generate_structured: %s", exc)
            return {"error": f"API-Fehler: {exc}"}

    async def generate_from_scene(self, scene_data: dict) -> dict:
        """Generate map from a scene's data.

        Builds a description from the scene's fields (title, read_aloud, gm_notes,
        mood) and passes it to ``generate_structured()``.

        Args:
            scene_data: Dict containing scene fields. Expected keys:
                ``title``, ``read_aloud``, ``gm_notes``, ``mood``,
                and optionally ``map_description``.

        Returns:
            Validated map data dict, or ``{"error": "..."}`` on failure.
        """
        err = self._check_client()
        if err:
            return err

        # Build a rich description from available scene data
        parts: list[str] = []

        title = scene_data.get("title", "")
        if title:
            parts.append(f"Szene: {title}")

        # Prefer explicit map_description if present
        map_desc = scene_data.get("map_description")
        if map_desc:
            parts.append(f"Kartenbeschreibung: {map_desc}")

        read_aloud = scene_data.get("read_aloud")
        if read_aloud:
            parts.append(f"Vorlesetext (Ortsbeschreibung): {read_aloud}")

        gm_notes = scene_data.get("gm_notes")
        if gm_notes:
            parts.append(f"Meisterinformationen: {gm_notes}")

        mood = scene_data.get("mood")
        if mood:
            parts.append(f"Stimmung: {mood}")

        if not parts:
            return {"error": "Keine Szenendaten vorhanden, aus denen eine Karte generiert werden kann."}

        description = "\n\n".join(parts)
        return await self.generate_structured(description)

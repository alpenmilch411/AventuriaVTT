"""PDF / text adventure extraction via Claude API.

Extracts structured adventure data from raw text or PDF content.
The AI is NEVER visible to players — GM only.
"""

import base64
import json
import logging
from typing import Optional

import anthropic

from config import get_settings
from ai.prompts import SYSTEM_BASE, ADVENTURE_EXTRACTION_PROMPT

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


def _validate_adventure_draft(data: dict) -> dict:
    """Ensure required top-level fields exist with sensible defaults."""
    defaults = {
        "title": "Unbenanntes Abenteuer",
        "description": None,
        "author": None,
        "difficulty": None,
        "player_count": None,
        "estimated_duration": None,
        "setting": None,
        "chapters": [],
        "npcs": [],
        "handouts": [],
    }
    for key, default in defaults.items():
        if key not in data:
            data[key] = default

    # Validate chapters have required fields
    for i, chapter in enumerate(data.get("chapters", [])):
        if "title" not in chapter:
            chapter["title"] = f"Kapitel {i + 1}"
        if "scenes" not in chapter:
            chapter["scenes"] = []
        if "summary" not in chapter:
            chapter["summary"] = None
        if "chapter_goal" not in chapter:
            chapter["chapter_goal"] = None

        for j, scene in enumerate(chapter.get("scenes", [])):
            if "title" not in scene:
                scene["title"] = f"Szene {j + 1}"
            for field in ("read_aloud", "gm_notes", "mood", "npcs", "transitions", "encounter"):
                if field not in scene:
                    scene[field] = None

    # Validate NPCs
    for npc in data.get("npcs", []):
        if "name" not in npc:
            npc["name"] = "Unbenannter NSC"
        for field in ("personality_tags", "knows", "secrets"):
            if field not in npc:
                npc[field] = []
        if "attitude_to_party" not in npc:
            npc["attitude_to_party"] = "neutral"
        if "location" not in npc:
            npc["location"] = None

    return data


class AdventureExtractor:
    """Extract structured adventure data from text, PDF, or images using Claude."""

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

    # ------------------------------------------------------------------
    # Public async methods
    # ------------------------------------------------------------------

    async def extract_from_text(self, text: str) -> dict:
        """Extract adventure structure from raw text.

        Returns a validated adventure draft dict, or ``{"error": "..."}`` on failure.
        """
        err = self._check_client()
        if err:
            return err

        system = f"{SYSTEM_BASE}\n\n{ADVENTURE_EXTRACTION_PROMPT}"
        user_message = f"Extrahiere die Abenteuerdaten aus folgendem Text:\n\n{text}"

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=4096,
                system=system,
                messages=[{"role": "user", "content": user_message}],
            )
            raw = response.content[0].text
            parsed = _extract_json(raw)
            if parsed is None:
                logger.warning("Could not parse JSON from adventure extraction response")
                return {
                    "error": "Konnte kein valides JSON aus der KI-Antwort extrahieren.",
                    "raw_response": raw,
                }
            if not isinstance(parsed, dict):
                return {
                    "error": "KI-Antwort ist kein JSON-Objekt.",
                    "raw_response": raw,
                }
            return _validate_adventure_draft(parsed)
        except anthropic.APIError as exc:
            logger.error("Anthropic API error in extract_from_text: %s", exc)
            return {"error": f"API-Fehler: {exc}"}

    async def extract_from_pdf(self, pdf_content: bytes) -> dict:
        """Extract adventure structure from PDF bytes.

        Sends the PDF as a base64-encoded document to Claude's document understanding,
        then parses the structured adventure data.
        """
        err = self._check_client()
        if err:
            return err

        system = f"{SYSTEM_BASE}\n\n{ADVENTURE_EXTRACTION_PROMPT}"
        pdf_b64 = base64.standard_b64encode(pdf_content).decode("utf-8")

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=4096,
                system=system,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "document",
                                "source": {
                                    "type": "base64",
                                    "media_type": "application/pdf",
                                    "data": pdf_b64,
                                },
                            },
                            {
                                "type": "text",
                                "text": (
                                    "Extrahiere die Abenteuerdaten aus diesem PDF-Dokument. "
                                    "Antworte ausschliesslich mit dem JSON-Objekt."
                                ),
                            },
                        ],
                    }
                ],
            )
            raw = response.content[0].text
            parsed = _extract_json(raw)
            if parsed is None:
                logger.warning("Could not parse JSON from PDF extraction response")
                return {
                    "error": "Konnte kein valides JSON aus der KI-Antwort extrahieren.",
                    "raw_response": raw,
                }
            if not isinstance(parsed, dict):
                return {
                    "error": "KI-Antwort ist kein JSON-Objekt.",
                    "raw_response": raw,
                }
            return _validate_adventure_draft(parsed)
        except anthropic.APIError as exc:
            logger.error("Anthropic API error in extract_from_pdf: %s", exc)
            return {"error": f"API-Fehler: {exc}"}

    async def describe_map_image(self, image_data: bytes, media_type: str = "image/png") -> str:
        """Use Claude Vision to describe a map image.

        Returns a text description of the map layout that can be passed to
        ``MapGenerator.generate_structured()`` or used directly by the GM.
        """
        err = self._check_client()
        if err:
            return err["error"]

        image_b64 = base64.standard_b64encode(image_data).decode("utf-8")

        system = (
            f"{SYSTEM_BASE}\n\n"
            "Du erhaeltst ein Bild einer Karte (Dungeon, Gebaeude, Wildnis etc.). "
            "Beschreibe die Karte detailliert auf Deutsch: Raeume, Gaenge, Tuerenm "
            "Moebel, Gelaende, Lichtquellen, besondere Merkmale. "
            "Die Beschreibung soll so praezise sein, dass daraus eine VTT-Karte "
            "erstellt werden kann. Nenne Groessenverhaeltnisse in Schritt (1 Schritt = 1 Meter). "
            "Beschreibe die relative Position aller Elemente zueinander."
        )

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=2048,
                system=system,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": image_b64,
                                },
                            },
                            {
                                "type": "text",
                                "text": "Beschreibe diese Karte detailliert fuer die VTT-Umsetzung.",
                            },
                        ],
                    }
                ],
            )
            return response.content[0].text.strip()
        except anthropic.APIError as exc:
            logger.error("Anthropic API error in describe_map_image: %s", exc)
            return f"Fehler bei der Kartenanalyse: {exc}"

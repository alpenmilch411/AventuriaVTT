"""On-demand NPC generation via Claude API.

Generates random NPCs fitting the DSA5 Aventurien setting.
The AI is NEVER visible to players — GM only.
"""

import json
import logging
from typing import Optional

import anthropic

from config import get_settings
from ai.prompts import SYSTEM_BASE, NPC_GENERATION_PROMPT, NPC_DIALOG_PROMPT

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


def _validate_npc_data(data: dict) -> dict:
    """Ensure required NPC fields exist with sensible defaults."""
    defaults = {
        "name": "Unbenannter NSC",
        "personality_tags": [],
        "voice_notes": "",
        "knows": [],
        "secrets": [],
        "attitude_to_party": "neutral",
        "location": "",
        "tags": [],
        "gm_notes": "",
    }
    for key, default in defaults.items():
        if key not in data or data[key] is None:
            data[key] = default

    # Ensure list fields are actually lists
    for list_field in ("personality_tags", "knows", "secrets", "tags"):
        if not isinstance(data[list_field], list):
            data[list_field] = [str(data[list_field])]

    # Ensure string fields are strings
    for str_field in ("name", "voice_notes", "attitude_to_party", "location", "gm_notes"):
        if not isinstance(data[str_field], str):
            data[str_field] = str(data[str_field])

    return data


class NPCGenerator:
    """Generate random DSA5-appropriate NPCs using Claude."""

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

    async def generate(self, constraints: Optional[dict] = None) -> dict:
        """Generate a random NPC.

        Args:
            constraints: Optional dict with keys ``setting``, ``role``,
                ``attitude``, ``tags`` to guide generation.

        Returns:
            A dict matching the NPC model structure with fields:
            ``name``, ``personality_tags``, ``voice_notes``, ``knows``,
            ``secrets``, ``attitude_to_party``, ``location``, ``tags``,
            ``gm_notes``.
            On error, returns ``{"error": "..."}`` instead.
        """
        err = self._check_client()
        if err:
            return err

        system = f"{SYSTEM_BASE}\n\n{NPC_GENERATION_PROMPT}"

        if constraints:
            constraint_parts: list[str] = ["Einschraenkungen fuer die NSC-Generierung:"]
            if "setting" in constraints:
                constraint_parts.append(f"- Region/Setting: {constraints['setting']}")
            if "role" in constraints:
                constraint_parts.append(f"- Rolle: {constraints['role']}")
            if "attitude" in constraints:
                constraint_parts.append(f"- Grundhaltung: {constraints['attitude']}")
            if "tags" in constraints:
                tags = constraints["tags"]
                if isinstance(tags, list):
                    tags = ", ".join(tags)
                constraint_parts.append(f"- Tags: {tags}")
            # Pass through any extra constraints
            for key, value in constraints.items():
                if key not in ("setting", "role", "attitude", "tags"):
                    constraint_parts.append(f"- {key}: {value}")
            user_message = "\n".join(constraint_parts)
        else:
            user_message = (
                "Generiere einen zufaelligen NSC fuer eine DSA5-Kampagne. "
                "Waehle Region, Beruf und Persoenlichkeit frei."
            )

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=1024,
                system=system,
                messages=[{"role": "user", "content": user_message}],
            )
            raw = response.content[0].text
            parsed = _extract_json(raw)

            if parsed is None or not isinstance(parsed, dict):
                logger.warning("Could not parse JSON from NPC generation response")
                return {
                    "error": "Konnte kein valides JSON aus der KI-Antwort extrahieren.",
                    "raw_response": raw,
                }

            return _validate_npc_data(parsed)
        except anthropic.APIError as exc:
            logger.error("Anthropic API error in NPC generate: %s", exc)
            return {"error": f"API-Fehler: {exc}"}

    async def generate_dialog(self, npc_data: dict, context: str) -> str:
        """Generate dialog for an existing NPC given situational context.

        Args:
            npc_data: Dict with NPC fields (name, personality_tags, knows, etc.)
            context: Free-text description of the current situation.

        Returns:
            In-character dialog string, or an error message.
        """
        err = self._check_client()
        if err:
            return err["error"]

        system = f"{SYSTEM_BASE}\n\n{NPC_DIALOG_PROMPT}"
        user_message = (
            f"NSC-Profil:\n{json.dumps(npc_data, ensure_ascii=False, indent=2)}\n\n"
            f"Situationskontext: {context}\n\n"
            "Generiere einen passenden Dialog-Beitrag dieses NSC."
        )

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=1024,
                system=system,
                messages=[{"role": "user", "content": user_message}],
            )
            return response.content[0].text.strip()
        except anthropic.APIError as exc:
            logger.error("Anthropic API error in generate_dialog: %s", exc)
            return f"Fehler bei der Dialog-Generierung: {exc}"

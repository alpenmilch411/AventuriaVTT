"""Claude API orchestration for GM assistance features.

The AI is NEVER visible to players — GM only.
"""

import json
import logging
from typing import Optional

import anthropic

from config import get_settings
from ai.prompts import (
    SYSTEM_BASE,
    NPC_DIALOG_PROMPT,
    RULES_QUERY_PROMPT,
    IMPROV_PROMPT,
    RECAP_PROMPT,
)

logger = logging.getLogger(__name__)

_NO_API_KEY_MSG = (
    "Kein ANTHROPIC_API_KEY konfiguriert. "
    "Bitte setze den API-Key in der .env-Datei, um KI-Funktionen zu nutzen."
)

# Map mode names to their system prompts
_MODE_PROMPTS: dict[str, str] = {
    "general": SYSTEM_BASE,
    "npc_dialog": f"{SYSTEM_BASE}\n\n{NPC_DIALOG_PROMPT}",
    "rules": f"{SYSTEM_BASE}\n\n{RULES_QUERY_PROMPT}",
    "improv": f"{SYSTEM_BASE}\n\n{IMPROV_PROMPT}",
    "recap": f"{SYSTEM_BASE}\n\n{RECAP_PROMPT}",
}


def _extract_json(text: str) -> Optional[any]:
    """Robustly extract JSON from a Claude response that may contain markdown fences."""
    text = text.strip()

    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Strip markdown code fences
    if "```" in text:
        # Find content between first ``` and last ```
        start = text.find("```")
        end = text.rfind("```")
        if start != end:
            inner = text[start:end]
            # Remove the opening fence line (```json or ```)
            first_newline = inner.find("\n")
            if first_newline != -1:
                inner = inner[first_newline + 1:]
            try:
                return json.loads(inner.strip())
            except json.JSONDecodeError:
                pass

    # Try to find JSON object or array boundaries
    for open_char, close_char in [("{", "}"), ("[", "]")]:
        start = text.find(open_char)
        end = text.rfind(close_char)
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                continue

    return None


def _build_context_block(context: Optional[dict]) -> str:
    """Build a context string from campaign/scene data for inclusion in the prompt."""
    if not context:
        return ""

    parts: list[str] = ["\n--- Kampagnenkontext ---"]

    if "campaign_name" in context:
        parts.append(f"Kampagne: {context['campaign_name']}")
    if "current_scene" in context:
        parts.append(f"Aktuelle Szene: {context['current_scene']}")
    if "active_quests" in context:
        quests = context["active_quests"]
        if isinstance(quests, list):
            parts.append("Aktive Quests: " + ", ".join(str(q) for q in quests))
    if "npcs_present" in context:
        npcs = context["npcs_present"]
        if isinstance(npcs, list):
            parts.append("Anwesende NSCs: " + ", ".join(str(n) for n in npcs))
    if "world_clock" in context:
        parts.append(f"Spielwelt-Zeit: {context['world_clock']}")
    if "weather" in context:
        parts.append(f"Wetter: {context['weather']}")
    if "location" in context:
        parts.append(f"Ort: {context['location']}")
    if "mood" in context:
        parts.append(f"Stimmung: {context['mood']}")

    # Allow arbitrary extra context
    for key, value in context.items():
        if key not in {
            "campaign_name", "current_scene", "active_quests",
            "npcs_present", "world_clock", "weather", "location", "mood",
        }:
            parts.append(f"{key}: {value}")

    parts.append("--- Ende Kontext ---\n")
    return "\n".join(parts)


class AIAssist:
    """Claude API orchestration for GM assistance features."""

    def __init__(self) -> None:
        settings = get_settings()
        self.client: Optional[anthropic.Anthropic] = None
        if settings.ANTHROPIC_API_KEY:
            self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.model = "claude-sonnet-4-20250514"

    def _check_client(self) -> Optional[dict]:
        """Return an error dict if the client is not configured, else None."""
        if self.client is None:
            return {"error": _NO_API_KEY_MSG, "response": _NO_API_KEY_MSG, "tokens_used": 0}
        return None

    def _call_api(
        self,
        system: str,
        user_message: str,
        max_tokens: int = 2048,
    ) -> tuple[str, int]:
        """Call the Anthropic API synchronously and return (text, tokens_used).

        The Anthropic Python SDK's ``client.messages.create()`` is synchronous.
        We wrap async at the public method level so callers can ``await``.
        """
        response = self.client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_message}],
        )
        text = response.content[0].text
        tokens_used = (response.usage.input_tokens or 0) + (response.usage.output_tokens or 0)
        return text, tokens_used

    # ------------------------------------------------------------------
    # Public async methods
    # ------------------------------------------------------------------

    async def query(
        self,
        prompt: str,
        context: Optional[dict] = None,
        mode: str = "general",
    ) -> dict:
        """General AI query with context.

        Returns ``{"response": str, "mode": str, "tokens_used": int}``
        or ``{"error": str, ...}`` if unavailable.
        """
        err = self._check_client()
        if err:
            return err

        system_prompt = _MODE_PROMPTS.get(mode, SYSTEM_BASE)
        user_message = _build_context_block(context) + prompt

        try:
            text, tokens = self._call_api(system_prompt, user_message)
            return {"response": text, "mode": mode, "tokens_used": tokens}
        except anthropic.APIError as exc:
            logger.error("Anthropic API error in query: %s", exc)
            return {
                "error": f"API-Fehler: {exc}",
                "response": "",
                "mode": mode,
                "tokens_used": 0,
            }

    async def npc_dialog(
        self,
        npc_profile: dict,
        scene_context: dict,
        player_question: str,
    ) -> str:
        """Generate in-character NPC dialog.

        Returns the dialog string, or an error message.
        """
        err = self._check_client()
        if err:
            return err["error"]

        system = f"{SYSTEM_BASE}\n\n{NPC_DIALOG_PROMPT}"
        user_message = (
            f"NSC-Profil:\n{json.dumps(npc_profile, ensure_ascii=False, indent=2)}\n\n"
            f"Szenenkontext:\n{json.dumps(scene_context, ensure_ascii=False, indent=2)}\n\n"
            f"Spieler sagt/fragt: {player_question}"
        )

        try:
            text, _ = self._call_api(system, user_message, max_tokens=1024)
            return text.strip()
        except anthropic.APIError as exc:
            logger.error("Anthropic API error in npc_dialog: %s", exc)
            return f"Fehler bei der NPC-Dialog-Generierung: {exc}"

    async def rules_query(
        self,
        question: str,
        rules_context: Optional[list] = None,
    ) -> str:
        """Answer a DSA5 rules question.

        ``rules_context`` may contain additional rule snippets from the databank.
        Returns the answer string.
        """
        err = self._check_client()
        if err:
            return err["error"]

        system = f"{SYSTEM_BASE}\n\n{RULES_QUERY_PROMPT}"
        user_parts = [f"Regelfrage: {question}"]
        if rules_context:
            user_parts.append(
                "\nRegelkontext aus der Datenbank:\n"
                + "\n---\n".join(str(r) for r in rules_context)
            )
        user_message = "\n".join(user_parts)

        try:
            text, _ = self._call_api(system, user_message, max_tokens=2048)
            return text.strip()
        except anthropic.APIError as exc:
            logger.error("Anthropic API error in rules_query: %s", exc)
            return f"Fehler bei der Regelbeantwortung: {exc}"

    async def improv_suggestions(
        self,
        situation: str,
        campaign_context: Optional[dict] = None,
    ) -> list[str]:
        """Generate 3-4 improv suggestions fitting the adventure's tone.

        Returns a list of suggestion strings.
        """
        err = self._check_client()
        if err:
            return [err["error"]]

        system = f"{SYSTEM_BASE}\n\n{IMPROV_PROMPT}"
        user_message = _build_context_block(campaign_context) + f"Aktuelle Situation: {situation}"

        try:
            text, _ = self._call_api(system, user_message, max_tokens=2048)
            parsed = _extract_json(text)
            if isinstance(parsed, list):
                return [str(item) for item in parsed]
            # Fallback: split by numbered items or return as single item
            return [text.strip()]
        except anthropic.APIError as exc:
            logger.error("Anthropic API error in improv_suggestions: %s", exc)
            return [f"Fehler bei der Improv-Generierung: {exc}"]

    async def session_recap(self, session_log: dict) -> str:
        """Generate a narrative session recap from structured log data.

        Returns the recap text string.
        """
        err = self._check_client()
        if err:
            return err["error"]

        system = f"{SYSTEM_BASE}\n\n{RECAP_PROMPT}"
        user_message = (
            "Sitzungsdaten:\n"
            + json.dumps(session_log, ensure_ascii=False, indent=2)
        )

        try:
            text, _ = self._call_api(system, user_message, max_tokens=2048)
            return text.strip()
        except anthropic.APIError as exc:
            logger.error("Anthropic API error in session_recap: %s", exc)
            return f"Fehler bei der Recap-Generierung: {exc}"

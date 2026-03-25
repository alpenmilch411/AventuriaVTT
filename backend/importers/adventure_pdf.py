"""AI-assisted extraction of adventure data from PDFs and photos.

Uses Claude to parse unstructured adventure text into structured data
matching the Adventure/Chapter/Scene models. Supports PDF documents
and scanned images (photos of adventure pages).
"""

from __future__ import annotations

import io
import json
import logging
import re
from typing import Any, Optional

log = logging.getLogger("importers.adventure_pdf")

# System prompt for Claude extraction
_EXTRACTION_SYSTEM_PROMPT = """\
Du bist ein Experte fuer DSA5-Abenteuer (Das Schwarze Auge, 5. Edition).
Du extrahierst strukturierte Abenteuerdaten aus Fliesstext.

Antworte IMMER als valides JSON mit genau dieser Struktur:

{
    "title": "Abenteuertitel",
    "description": "Kurzbeschreibung des Abenteuers",
    "author": "Autor (falls erkennbar)",
    "difficulty": "leicht|mittel|schwer|toedlich",
    "player_count": "3-5",
    "estimated_duration": "1-2 Spielabende",
    "setting": "Ort/Region in Aventurien",
    "tags": ["Kampagne", "Dungeon", "Stadtabenteuer", ...],
    "chapters": [
        {
            "title": "Kapiteltitel",
            "summary": "Zusammenfassung des Kapitels",
            "chapter_goal": "Ziel fuer die Helden in diesem Kapitel",
            "sort_order": 0,
            "scenes": [
                {
                    "title": "Szenentitel",
                    "read_aloud": "Vorlesetext fuer die Spieler (falls vorhanden)",
                    "gm_notes": "Notizen fuer den Spielleiter",
                    "npcs": [
                        {
                            "name": "NPC-Name",
                            "personality_tags": ["freundlich", "misstrauisch"],
                            "attitude_to_party": "freundlich|neutral|feindlich",
                            "location": "Wo der NPC zu finden ist",
                            "knows": ["Was der NPC weiss"],
                            "secrets": ["Geheimes Wissen"],
                            "is_combatant": false,
                            "creature_template_id": null
                        }
                    ],
                    "mood": "Stimmung der Szene",
                    "transitions": {
                        "next": "Naechste Szene bei Erfolg",
                        "failure": "Szene bei Misserfolg (falls relevant)"
                    },
                    "triggers": [
                        {
                            "type": "probe|kampf|rollenspiel|zeitlich",
                            "description": "Was den Trigger ausloest",
                            "effect": "Was passiert"
                        }
                    ],
                    "sort_order": 0
                }
            ]
        }
    ],
    "creatures": [
        {
            "name": "Kreaturname",
            "category": "Tier|Daemonisch|Untot|...",
            "attributes": {"MU": 12, "KL": 10, "IN": 13, "CH": 8, "FF": 11, "GE": 14, "KO": 12, "KK": 14},
            "combat_values": {"LeP": 30, "INI_basis": 13, "GS": 8, "AW": 7, "RS": 2, "SK": 2, "ZK": 3},
            "attacks": [{"name": "Biss", "at": 12, "tp": "1W6+4"}]
        }
    ]
}

Regeln:
- Extrahiere so viel Struktur wie moeglich aus dem Text.
- Wenn Informationen nicht im Text stehen, lasse die Felder weg oder setze null.
- Kampfwerte und Kreaturdaten muessen den DSA5-Regeln entsprechen.
- Vorlesetexte (read_aloud) sind oft kursiv oder eingerueckt im Original.
- Trenne SL-Hinweise klar von Spielerinformationen.
- NPCs, die im Kampf relevant sind, muessen is_combatant=true haben.
- Gib creature_template_id nur an, wenn es eine Standard-DSA5-Kreatur ist.
"""

_EXTRACTION_USER_TEMPLATE = """\
Extrahiere die Abenteuerdaten aus dem folgenden Text.
Der Text stammt aus einem DSA5-Abenteuer (PDF oder Scan).

---
{text}
---

Antworte NUR mit dem JSON-Objekt, kein weiterer Text.
"""


class AdventurePDFImporter:
    """AI-assisted extraction of adventure data from PDFs and photos.

    Requires the ``anthropic`` package and an API key configured in settings.

    Usage::

        importer = AdventurePDFImporter()
        result = await importer.extract(pdf_bytes, file_type="pdf")
        # result is an AdventureDraft dict ready for insertion
    """

    # Maximum text length to send to Claude in one request
    MAX_TEXT_LENGTH = 180_000
    # Maximum image size (bytes) to send inline
    MAX_IMAGE_SIZE = 20 * 1024 * 1024  # 20 MB

    def __init__(self, api_key: Optional[str] = None) -> None:
        """Initialize with optional explicit API key.

        If not provided, the key is loaded from application settings.
        """
        self._api_key = api_key

    def _get_api_key(self) -> str:
        """Resolve the Anthropic API key."""
        if self._api_key:
            return self._api_key
        from config import get_settings
        key = get_settings().ANTHROPIC_API_KEY
        if not key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not configured. Set it in .env or "
                "pass it to AdventurePDFImporter(api_key=...)."
            )
        return key

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def extract(
        self,
        file_content: bytes,
        file_type: str = "pdf",
    ) -> dict[str, Any]:
        """Main extraction pipeline.

        Steps:
            1. Extract text from PDF or prepare image for vision
            2. Send to Claude for structured extraction
            3. Post-process and validate
            4. Return AdventureDraft dict

        Args:
            file_content: Raw file bytes (PDF or image).
            file_type: One of "pdf", "png", "jpg", "jpeg", "webp".

        Returns:
            Dict matching Adventure/Chapter/Scene model fields, plus
            a ``_meta`` key with extraction metadata (confidence, warnings).

        Raises:
            ValueError: If the file type is unsupported or content is empty.
            RuntimeError: If AI extraction fails.
        """
        if not file_content:
            raise ValueError("File content is empty.")

        file_type = file_type.lower().strip().lstrip(".")

        supported_types = {"pdf", "png", "jpg", "jpeg", "webp"}
        if file_type not in supported_types:
            raise ValueError(
                f"Unsupported file type '{file_type}'. "
                f"Supported: {', '.join(sorted(supported_types))}"
            )

        # Step 1: Extract text or prepare image
        if file_type == "pdf":
            text = self._extract_pdf_text(file_content)
            raw_draft = await self._ai_extract_from_text(text)
        else:
            raw_draft = await self._ai_extract_from_image(file_content, file_type)

        # Step 3: Post-process
        draft = self._post_process(raw_draft)

        # Step 4: Calculate confidence
        meta = self._calculate_confidence(draft)
        draft["_meta"] = meta

        return draft

    # ------------------------------------------------------------------
    # Text extraction
    # ------------------------------------------------------------------

    def _extract_pdf_text(self, pdf_content: bytes) -> str:
        """Extract text from a PDF file.

        Attempts to use ``PyPDF2`` or ``pdfplumber`` for text extraction.
        Falls back to a descriptive message if no PDF library is available.

        Args:
            pdf_content: Raw PDF bytes.

        Returns:
            Extracted text content.
        """
        text = ""

        # Try PyPDF2 first (lightweight)
        try:
            import PyPDF2
            reader = PyPDF2.PdfReader(io.BytesIO(pdf_content))
            pages_text: list[str] = []
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    pages_text.append(page_text)
            text = "\n\n---\n\n".join(pages_text)
            if text.strip():
                log.info(
                    "Extracted %d characters from %d PDF pages (PyPDF2).",
                    len(text), len(reader.pages),
                )
                return self._truncate_text(text)
        except ImportError:
            log.debug("PyPDF2 not installed, trying pdfplumber.")
        except Exception as exc:
            log.warning("PyPDF2 extraction failed: %s", exc)

        # Try pdfplumber (better for complex layouts)
        try:
            import pdfplumber
            pages_text = []
            with pdfplumber.open(io.BytesIO(pdf_content)) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        pages_text.append(page_text)
            text = "\n\n---\n\n".join(pages_text)
            if text.strip():
                log.info(
                    "Extracted %d characters from PDF (pdfplumber).",
                    len(text),
                )
                return self._truncate_text(text)
        except ImportError:
            log.debug("pdfplumber not installed.")
        except Exception as exc:
            log.warning("pdfplumber extraction failed: %s", exc)

        if not text.strip():
            raise ValueError(
                "Could not extract text from PDF. The PDF may be image-based "
                "(scanned). Install PyPDF2 or pdfplumber, or convert to images "
                "and use image extraction instead."
            )

        return self._truncate_text(text)

    def _truncate_text(self, text: str) -> str:
        """Truncate text to fit within Claude's context window."""
        if len(text) <= self.MAX_TEXT_LENGTH:
            return text
        log.warning(
            "Text exceeds %d chars (%d). Truncating.",
            self.MAX_TEXT_LENGTH, len(text),
        )
        return text[:self.MAX_TEXT_LENGTH] + "\n\n[... Text abgeschnitten ...]"

    # ------------------------------------------------------------------
    # AI extraction
    # ------------------------------------------------------------------

    async def _ai_extract_from_text(self, text: str) -> dict:
        """Send extracted text to Claude for structured adventure extraction.

        Args:
            text: Plain text extracted from the PDF.

        Returns:
            Parsed JSON dict from Claude's response.
        """
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=self._get_api_key())

        user_message = _EXTRACTION_USER_TEMPLATE.format(text=text)

        try:
            response = await client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=8192,
                system=_EXTRACTION_SYSTEM_PROMPT,
                messages=[
                    {"role": "user", "content": user_message},
                ],
            )
        except anthropic.APIError as exc:
            log.error("Anthropic API error during extraction: %s", exc)
            raise RuntimeError(f"AI extraction failed: {exc}") from exc

        return self._parse_ai_response(response)

    async def _ai_extract_from_image(
        self, image_content: bytes, file_type: str
    ) -> dict:
        """Send an image to Claude for vision-based adventure extraction.

        Args:
            image_content: Raw image bytes.
            file_type: Image format (png, jpg, jpeg, webp).

        Returns:
            Parsed JSON dict from Claude's response.
        """
        import anthropic
        import base64

        if len(image_content) > self.MAX_IMAGE_SIZE:
            raise ValueError(
                f"Image too large ({len(image_content)} bytes). "
                f"Maximum: {self.MAX_IMAGE_SIZE} bytes."
            )

        media_type_map = {
            "png": "image/png",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "webp": "image/webp",
        }
        media_type = media_type_map.get(file_type, "image/jpeg")
        image_b64 = base64.b64encode(image_content).decode("ascii")

        client = anthropic.AsyncAnthropic(api_key=self._get_api_key())

        try:
            response = await client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=8192,
                system=_EXTRACTION_SYSTEM_PROMPT,
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
                                "text": (
                                    "Extrahiere die Abenteuerdaten aus diesem "
                                    "Bild/Scan einer DSA5-Abenteuerseite. "
                                    "Antworte NUR mit dem JSON-Objekt."
                                ),
                            },
                        ],
                    }
                ],
            )
        except anthropic.APIError as exc:
            log.error("Anthropic API error during image extraction: %s", exc)
            raise RuntimeError(f"AI image extraction failed: {exc}") from exc

        return self._parse_ai_response(response)

    def _parse_ai_response(self, response: Any) -> dict:
        """Parse Claude's response into a structured dict.

        Handles potential markdown code fences around the JSON.
        """
        # Extract text from response
        text = ""
        for block in response.content:
            if hasattr(block, "text"):
                text += block.text

        if not text.strip():
            raise RuntimeError("AI returned empty response.")

        # Strip markdown code fences if present
        text = text.strip()
        if text.startswith("```"):
            # Remove opening fence (```json or ```)
            text = re.sub(r"^```(?:json)?\s*\n?", "", text)
            # Remove closing fence
            text = re.sub(r"\n?```\s*$", "", text)
            text = text.strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            log.error("Failed to parse AI response as JSON: %s", exc)
            log.debug("Raw AI response: %s", text[:2000])

            # Attempt to extract JSON from within the text
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                try:
                    return json.loads(json_match.group())
                except json.JSONDecodeError:
                    pass

            raise RuntimeError(
                f"AI response is not valid JSON: {exc}"
            ) from exc

    # ------------------------------------------------------------------
    # Post-processing
    # ------------------------------------------------------------------

    def _post_process(self, draft: dict) -> dict:
        """Validate and clean up the extracted adventure draft.

        - Ensures required fields exist
        - Validates creature stats against DSA5 ranges
        - Assigns sort_order to chapters and scenes
        - Links NPC references across scenes
        - Normalizes difficulty strings

        Args:
            draft: Raw extracted dict from AI.

        Returns:
            Cleaned and validated adventure draft dict.
        """
        # Ensure title
        if not draft.get("title"):
            draft["title"] = "Importiertes Abenteuer"

        # Normalize difficulty
        difficulty = (draft.get("difficulty") or "").lower()
        valid_difficulties = {"leicht", "mittel", "schwer", "toedlich", "tödlich"}
        if difficulty not in valid_difficulties:
            draft["difficulty"] = None
        elif difficulty == "tödlich":
            draft["difficulty"] = "toedlich"

        # Set source
        draft["source"] = "imported"

        # Process chapters
        chapters = draft.get("chapters", [])
        if not isinstance(chapters, list):
            chapters = []

        npc_registry: dict[str, dict] = {}  # Track NPCs across scenes

        for ch_idx, chapter in enumerate(chapters):
            if not isinstance(chapter, dict):
                continue

            chapter.setdefault("title", f"Kapitel {ch_idx + 1}")
            chapter["sort_order"] = ch_idx

            scenes = chapter.get("scenes", [])
            if not isinstance(scenes, list):
                scenes = []

            for sc_idx, scene in enumerate(scenes):
                if not isinstance(scene, dict):
                    continue

                scene.setdefault("title", f"Szene {sc_idx + 1}")
                scene["sort_order"] = sc_idx
                scene["status"] = "upcoming"

                # Register NPCs
                scene_npcs = scene.get("npcs", [])
                if isinstance(scene_npcs, list):
                    for npc in scene_npcs:
                        if isinstance(npc, dict) and npc.get("name"):
                            name = npc["name"]
                            if name in npc_registry:
                                # Merge data: keep richer entry
                                existing = npc_registry[name]
                                for key, val in npc.items():
                                    if val and not existing.get(key):
                                        existing[key] = val
                            else:
                                npc_registry[name] = dict(npc)

            chapter["scenes"] = scenes

        draft["chapters"] = chapters

        # Validate creatures
        creatures = draft.get("creatures", [])
        if isinstance(creatures, list):
            validated_creatures: list[dict] = []
            for creature in creatures:
                if isinstance(creature, dict) and creature.get("name"):
                    creature = self._validate_creature_stats(creature)
                    validated_creatures.append(creature)
            draft["creatures"] = validated_creatures

        # Attach NPC registry
        if npc_registry:
            draft["_npc_registry"] = list(npc_registry.values())

        return draft

    def _validate_creature_stats(self, creature: dict) -> dict:
        """Validate creature combat stats against DSA5 reasonable ranges.

        Adds warnings for stats that seem off.
        """
        warnings: list[str] = []
        name = creature.get("name", "Unknown")

        # Check attributes
        attrs = creature.get("attributes", {})
        if isinstance(attrs, dict):
            for attr_name, value in attrs.items():
                if isinstance(value, (int, float)):
                    if value < 0 or value > 30:
                        warnings.append(
                            f"Creature '{name}': attribute {attr_name}={value} "
                            f"is outside normal range (0-30)."
                        )

        # Check combat values
        cv = creature.get("combat_values", {})
        if isinstance(cv, dict):
            lep = cv.get("LeP", 0)
            if isinstance(lep, (int, float)) and (lep < 1 or lep > 500):
                warnings.append(
                    f"Creature '{name}': LeP={lep} seems unusual."
                )

            gs = cv.get("GS", 0)
            if isinstance(gs, (int, float)) and (gs < 0 or gs > 20):
                warnings.append(
                    f"Creature '{name}': GS={gs} seems unusual."
                )

        # Check attacks
        attacks = creature.get("attacks", [])
        if isinstance(attacks, list):
            for attack in attacks:
                if isinstance(attack, dict):
                    at = attack.get("at", 0)
                    if isinstance(at, (int, float)) and (at < 0 or at > 25):
                        warnings.append(
                            f"Creature '{name}': attack AT={at} seems unusual."
                        )

        if warnings:
            creature["_validation_warnings"] = warnings

        return creature

    # ------------------------------------------------------------------
    # Confidence scoring
    # ------------------------------------------------------------------

    def _calculate_confidence(self, draft: dict) -> dict:
        """Calculate extraction confidence scores per section.

        Returns a dict with:
            overall (float): 0.0-1.0 overall confidence
            sections (dict): Per-section confidence scores
            warnings (list[str]): Extraction-level warnings
        """
        warnings: list[str] = []
        section_scores: dict[str, float] = {}

        # Title confidence
        title = draft.get("title", "")
        if title and title != "Importiertes Abenteuer":
            section_scores["title"] = 1.0
        else:
            section_scores["title"] = 0.3
            warnings.append("Title could not be reliably extracted.")

        # Description confidence
        desc = draft.get("description", "")
        if desc and len(desc) > 20:
            section_scores["description"] = 0.9
        elif desc:
            section_scores["description"] = 0.5
        else:
            section_scores["description"] = 0.0
            warnings.append("No description extracted.")

        # Chapter/Scene structure confidence
        chapters = draft.get("chapters", [])
        if chapters and len(chapters) > 0:
            scene_count = sum(
                len(ch.get("scenes", []))
                for ch in chapters
                if isinstance(ch, dict)
            )
            if scene_count > 2:
                section_scores["structure"] = 0.9
            elif scene_count > 0:
                section_scores["structure"] = 0.6
            else:
                section_scores["structure"] = 0.3
                warnings.append("Chapters found but no scenes extracted.")
        else:
            section_scores["structure"] = 0.0
            warnings.append("No chapter structure extracted.")

        # NPC confidence
        npc_registry = draft.get("_npc_registry", [])
        if npc_registry and len(npc_registry) > 0:
            # Check completeness of NPC data
            complete_npcs = sum(
                1 for npc in npc_registry
                if npc.get("name") and npc.get("personality_tags")
            )
            section_scores["npcs"] = min(
                1.0, 0.5 + (complete_npcs / max(len(npc_registry), 1)) * 0.5
            )
        else:
            section_scores["npcs"] = 0.0

        # Creature confidence
        creatures = draft.get("creatures", [])
        if creatures:
            valid_creatures = sum(
                1 for c in creatures
                if isinstance(c, dict)
                and c.get("combat_values")
                and not c.get("_validation_warnings")
            )
            section_scores["creatures"] = min(
                1.0, 0.5 + (valid_creatures / max(len(creatures), 1)) * 0.5
            )
        else:
            section_scores["creatures"] = 0.0  # Not necessarily a problem

        # Overall confidence = weighted average
        weights = {
            "title": 0.1,
            "description": 0.1,
            "structure": 0.4,
            "npcs": 0.2,
            "creatures": 0.2,
        }
        overall = sum(
            section_scores.get(section, 0.0) * weight
            for section, weight in weights.items()
        )

        return {
            "overall": round(overall, 3),
            "sections": section_scores,
            "warnings": warnings,
        }

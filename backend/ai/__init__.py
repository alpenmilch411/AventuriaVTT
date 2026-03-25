"""AI assist module for Aventuria VTT — GM only, never visible to players.

Provides Claude-powered assistance for:
- General GM queries and NPC dialog generation
- DSA5 rules questions
- Improvisation suggestions
- Session recap generation
- Adventure extraction from text/PDF
- Random NPC generation
- AI map generation from text descriptions
"""

from ai.assist import AIAssist
from ai.extraction import AdventureExtractor
from ai.npc_generator import NPCGenerator
from ai.map_generator import MapGenerator

__all__ = [
    "AIAssist",
    "AdventureExtractor",
    "NPCGenerator",
    "MapGenerator",
]

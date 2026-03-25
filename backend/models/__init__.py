"""AventuriaVTT database models – DSA5 virtual tabletop."""

# User
from models.user import User

# Character
from models.character import Character

# Campaign, groups, quests, lore
from models.campaign import (
    Group,
    GroupMember,
    Campaign,
    CampaignPlayer,
    Quest,
    LoreEntry,
    TimelineEvent,
)

# Live session & combat
from models.session_state import (
    GameSession,
    CombatState,
    SessionLog,
    APAward,
)

# Adventures, chapters, scenes
from models.adventure import (
    Adventure,
    Chapter,
    Scene,
)

# Maps, tokens, triggers
from models.map import (
    GameMap,
    MapToken,
    MapTrigger,
)

# NPCs
from models.npc import NPC

# Inventory
from models.inventory import (
    InventoryItem,
    GroupInventory,
)

# Databank / reference templates
from models.databank import (
    CreatureTemplate,
    WeaponTemplate,
    ArmorTemplate,
    ShieldTemplate,
    ItemTemplate,
    SpellTemplate,
    LiturgyTemplate,
    SpecialAbilityTemplate,
    TalentTemplate,
    RulesSnippet,
)

__all__ = [
    # user
    "User",
    # character
    "Character",
    # campaign
    "Group",
    "GroupMember",
    "Campaign",
    "CampaignPlayer",
    "Quest",
    "LoreEntry",
    "TimelineEvent",
    # session
    "GameSession",
    "CombatState",
    "SessionLog",
    "APAward",
    # adventure
    "Adventure",
    "Chapter",
    "Scene",
    # map
    "GameMap",
    "MapToken",
    "MapTrigger",
    # npc
    "NPC",
    # inventory
    "InventoryItem",
    "GroupInventory",
    # databank
    "CreatureTemplate",
    "WeaponTemplate",
    "ArmorTemplate",
    "ShieldTemplate",
    "ItemTemplate",
    "SpellTemplate",
    "LiturgyTemplate",
    "SpecialAbilityTemplate",
    "TalentTemplate",
    "RulesSnippet",
]

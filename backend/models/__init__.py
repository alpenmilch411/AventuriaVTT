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
    SessionPlayer,
    SessionStatistics,
    CombatState,
    SessionLog,
    APAward,
    SessionSnapshot,
)

# Inventory
from models.inventory import (
    InventoryItem,
    GroupInventory,
)

# Wiki
from models.wiki import WikiPage

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
    CombatTechniqueTemplate,
    RulesSnippet,
    SpeciesTemplate,
    CultureTemplate,
    ProfessionTemplate,
    AdvantageTemplate,
    DisadvantageTemplate,
    CantripTemplate,
    BlessingTemplate,
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
    "SessionPlayer",
    "SessionStatistics",
    "CombatState",
    "SessionLog",
    "APAward",
    "SessionSnapshot",
    # inventory
    "InventoryItem",
    "GroupInventory",
    # wiki
    "WikiPage",
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
    "CombatTechniqueTemplate",
    "RulesSnippet",
    "SpeciesTemplate",
    "CultureTemplate",
    "ProfessionTemplate",
    "AdvantageTemplate",
    "DisadvantageTemplate",
    "CantripTemplate",
    "BlessingTemplate",
]

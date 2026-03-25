"""Campaign, group, quest, lore, and timeline models."""

import uuid
from datetime import datetime, date
from typing import Optional

from sqlalchemy import (
    String, DateTime, Text, ForeignKey, Integer, Date, Index, func,
)
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


# ---------------------------------------------------------------------------
# Group
# ---------------------------------------------------------------------------

class Group(Base):
    __tablename__ = "groups"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    created_by: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    # relationships
    creator: Mapped[Optional["User"]] = relationship(  # noqa: F821
        "User", back_populates="created_groups"
    )
    members: Mapped[list["GroupMember"]] = relationship(
        "GroupMember", back_populates="group", lazy="selectin",
        cascade="all, delete-orphan",
    )
    campaigns: Mapped[list["Campaign"]] = relationship(
        "Campaign", back_populates="group", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Group {self.name!r}>"


# ---------------------------------------------------------------------------
# GroupMember
# ---------------------------------------------------------------------------

class GroupMember(Base):
    __tablename__ = "group_members"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    group_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    display_name: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    role: Mapped[str] = mapped_column(
        String(16), nullable=False, default="member"
    )  # "admin" | "member"
    joined_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    # relationships
    group: Mapped["Group"] = relationship("Group", back_populates="members")
    user: Mapped["User"] = relationship("User", back_populates="group_memberships")  # noqa: F821

    __table_args__ = (
        Index("ix_group_members_group_user", "group_id", "user_id", unique=True),
    )

    def __repr__(self) -> str:
        return f"<GroupMember group={self.group_id} user={self.user_id}>"


# ---------------------------------------------------------------------------
# Campaign
# ---------------------------------------------------------------------------

class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    group_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("groups.id", ondelete="SET NULL"), nullable=True, index=True
    )
    gm_user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    adventure_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("adventures.id", ondelete="SET NULL"), nullable=True
    )
    current_scene_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )
    complexity_level: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    optional_rules: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active"
    )  # "active" | "paused" | "archived"
    campaign_code: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False, index=True
    )
    world_clock: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True, comment="date, time, day_night"
    )
    weather: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    last_played: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )

    # relationships
    group: Mapped[Optional["Group"]] = relationship("Group", back_populates="campaigns")
    gm: Mapped["User"] = relationship("User", back_populates="gm_campaigns")  # noqa: F821
    adventure: Mapped[Optional["Adventure"]] = relationship(  # noqa: F821
        "Adventure", back_populates="campaigns"
    )
    players: Mapped[list["CampaignPlayer"]] = relationship(
        "CampaignPlayer", back_populates="campaign", lazy="selectin",
        cascade="all, delete-orphan",
    )
    quests: Mapped[list["Quest"]] = relationship(
        "Quest", back_populates="campaign", lazy="selectin",
        cascade="all, delete-orphan",
    )
    lore_entries: Mapped[list["LoreEntry"]] = relationship(
        "LoreEntry", back_populates="campaign", lazy="selectin",
        cascade="all, delete-orphan",
    )
    timeline_events: Mapped[list["TimelineEvent"]] = relationship(
        "TimelineEvent", back_populates="campaign", lazy="selectin",
        cascade="all, delete-orphan",
    )
    sessions: Mapped[list["GameSession"]] = relationship(  # noqa: F821
        "GameSession", back_populates="campaign", lazy="selectin",
        cascade="all, delete-orphan",
    )
    maps: Mapped[list["GameMap"]] = relationship(  # noqa: F821
        "GameMap", back_populates="campaign", lazy="selectin"
    )
    npcs: Mapped[list["NPC"]] = relationship(  # noqa: F821
        "NPC", back_populates="campaign", lazy="selectin"
    )
    scenes: Mapped[list["Scene"]] = relationship(  # noqa: F821
        "Scene",
        back_populates="campaign",
        lazy="selectin",
        foreign_keys="[Scene.campaign_id]",
    )
    group_inventory: Mapped[Optional["GroupInventory"]] = relationship(  # noqa: F821
        "GroupInventory", back_populates="campaign", uselist=False, lazy="selectin"
    )
    campaign_inventory_items: Mapped[list["InventoryItem"]] = relationship(  # noqa: F821
        "InventoryItem", back_populates="campaign", lazy="selectin",
        foreign_keys="[InventoryItem.campaign_id]",
    )

    __table_args__ = (
        Index("ix_campaigns_status", "status"),
    )

    def __repr__(self) -> str:
        return f"<Campaign {self.name!r} [{self.status}]>"


# ---------------------------------------------------------------------------
# CampaignPlayer
# ---------------------------------------------------------------------------

class CampaignPlayer(Base):
    __tablename__ = "campaign_players"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    campaign_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    character_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("characters.id", ondelete="SET NULL"),
        nullable=True,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active"
    )  # "active" | "absent" | "left"
    campaign_snapshot: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
        comment="current_lep, asp, kap, conditions, campaign_inventory, npc_relationships, quest_progress",
    )

    # relationships
    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="players")
    user: Mapped["User"] = relationship("User", back_populates="campaign_players")  # noqa: F821
    character: Mapped["Character"] = relationship(  # noqa: F821
        "Character", back_populates="campaign_players"
    )

    __table_args__ = (
        Index("ix_campaign_players_camp_user", "campaign_id", "user_id", unique=True),
    )

    def __repr__(self) -> str:
        return f"<CampaignPlayer campaign={self.campaign_id} user={self.user_id}>"


# ---------------------------------------------------------------------------
# Quest
# ---------------------------------------------------------------------------

class Quest(Base):
    __tablename__ = "quests"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    campaign_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    type: Mapped[str] = mapped_column(
        String(16), nullable=False, default="side"
    )  # "main" | "side" | "personal"
    assigned_to: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("characters.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active"
    )  # "active" | "completed" | "failed" | "abandoned"
    given_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("npcs.id", ondelete="SET NULL"),
        nullable=True,
    )
    reward_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    objectives: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    gm_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_session: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    completed_session: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # relationships
    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="quests")
    assigned_character: Mapped[Optional["Character"]] = relationship(  # noqa: F821
        "Character", foreign_keys=[assigned_to]
    )
    given_by_npc: Mapped[Optional["NPC"]] = relationship(  # noqa: F821
        "NPC", foreign_keys=[given_by]
    )

    __table_args__ = (
        Index("ix_quests_campaign_status", "campaign_id", "status"),
    )

    def __repr__(self) -> str:
        return f"<Quest {self.title!r} [{self.status}]>"


# ---------------------------------------------------------------------------
# LoreEntry
# ---------------------------------------------------------------------------

class LoreEntry(Base):
    __tablename__ = "lore_entries"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    campaign_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    category: Mapped[str] = mapped_column(
        String(32), nullable=False
    )  # "person" | "location" | "discovery" | "event" | "item" | "faction"
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    player_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    gm_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    first_encountered: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    last_updated: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    tags: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    linked_entries: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    linked_npcs: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    linked_quests: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    reveals: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    # relationships
    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="lore_entries")

    __table_args__ = (
        Index("ix_lore_entries_campaign_category", "campaign_id", "category"),
    )

    def __repr__(self) -> str:
        return f"<LoreEntry {self.title!r} ({self.category})>"


# ---------------------------------------------------------------------------
# TimelineEvent
# ---------------------------------------------------------------------------

class TimelineEvent(Base):
    __tablename__ = "timeline_events"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    campaign_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    game_date: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    game_time: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    session_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    real_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    event_type: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    characters_involved: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    npcs_involved: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    linked_lore: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    linked_quest: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )

    # relationships
    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="timeline_events")

    __table_args__ = (
        Index("ix_timeline_events_campaign_session", "campaign_id", "session_number"),
    )

    def __repr__(self) -> str:
        return f"<TimelineEvent {self.title!r}>"

"""Adventure, chapter, and scene models."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, DateTime, Text, ForeignKey, Integer, Index, func
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


# ---------------------------------------------------------------------------
# Adventure
# ---------------------------------------------------------------------------

class Adventure(Base):
    __tablename__ = "adventures"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    author: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    difficulty: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    player_count: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    estimated_duration: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    setting: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    source: Mapped[str] = mapped_column(
        String(16), nullable=False, default="original"
    )  # "original" | "imported" | "community"
    tags: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    # relationships
    creator: Mapped[Optional["User"]] = relationship(  # noqa: F821
        "User", back_populates="created_adventures"
    )
    chapters: Mapped[list["Chapter"]] = relationship(
        "Chapter", back_populates="adventure", lazy="selectin",
        cascade="all, delete-orphan",
    )
    scenes: Mapped[list["Scene"]] = relationship(
        "Scene", back_populates="adventure", lazy="selectin",
        foreign_keys="[Scene.adventure_id]",
    )
    campaigns: Mapped[list["Campaign"]] = relationship(  # noqa: F821
        "Campaign", back_populates="adventure", lazy="selectin"
    )
    maps: Mapped[list["GameMap"]] = relationship(  # noqa: F821
        "GameMap", back_populates="adventure", lazy="selectin"
    )
    npcs: Mapped[list["NPC"]] = relationship(  # noqa: F821
        "NPC", back_populates="adventure", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Adventure {self.title!r}>"


# ---------------------------------------------------------------------------
# Chapter
# ---------------------------------------------------------------------------

class Chapter(Base):
    __tablename__ = "chapters"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    adventure_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("adventures.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    chapter_goal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # relationships
    adventure: Mapped["Adventure"] = relationship(
        "Adventure", back_populates="chapters"
    )
    scenes: Mapped[list["Scene"]] = relationship(
        "Scene", back_populates="chapter", lazy="selectin",
        foreign_keys="[Scene.chapter_id]",
    )

    __table_args__ = (
        Index("ix_chapters_adventure_order", "adventure_id", "sort_order"),
    )

    def __repr__(self) -> str:
        return f"<Chapter {self.title!r}>"


# ---------------------------------------------------------------------------
# Scene
# ---------------------------------------------------------------------------

class Scene(Base):
    __tablename__ = "scenes"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    chapter_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("chapters.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    campaign_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("campaigns.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    adventure_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("adventures.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    read_aloud: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    gm_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    gm_secrets: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    npcs: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    encounter_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )
    map_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )
    handouts: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    transitions: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    triggers: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    mood: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    ambient_sound: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    time_advance: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="upcoming"
    )  # "upcoming" | "active" | "completed"
    notes_during_play: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    content_list: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # relationships
    chapter: Mapped[Optional["Chapter"]] = relationship(
        "Chapter", back_populates="scenes", foreign_keys=[chapter_id]
    )
    campaign: Mapped[Optional["Campaign"]] = relationship(  # noqa: F821
        "Campaign", back_populates="scenes", foreign_keys=[campaign_id]
    )
    adventure: Mapped[Optional["Adventure"]] = relationship(
        "Adventure", back_populates="scenes", foreign_keys=[adventure_id]
    )

    __table_args__ = (
        Index("ix_scenes_chapter_order", "chapter_id", "sort_order"),
    )

    def __repr__(self) -> str:
        return f"<Scene {self.title!r} [{self.status}]>"

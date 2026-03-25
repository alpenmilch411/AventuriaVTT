"""Live session, combat state, session logs, and AP awards."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, DateTime, Text, ForeignKey, Integer, Index, func
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


# ---------------------------------------------------------------------------
# GameSession
# ---------------------------------------------------------------------------

class GameSession(Base):
    __tablename__ = "game_sessions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    campaign_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    session_number: Mapped[int] = mapped_column(Integer, nullable=False)
    session_code: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="lobby"
    )  # "lobby" | "active" | "paused" | "ended"
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    gm_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recap_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    campaign: Mapped["Campaign"] = relationship(  # noqa: F821
        "Campaign", back_populates="sessions"
    )
    combat_states: Mapped[list["CombatState"]] = relationship(
        "CombatState", back_populates="session", lazy="selectin",
        cascade="all, delete-orphan",
    )
    logs: Mapped[list["SessionLog"]] = relationship(
        "SessionLog", back_populates="session", lazy="selectin",
        cascade="all, delete-orphan",
    )
    ap_awards: Mapped[list["APAward"]] = relationship(
        "APAward", back_populates="session", lazy="selectin",
        cascade="all, delete-orphan",
    )
    inventory_items: Mapped[list["InventoryItem"]] = relationship(  # noqa: F821
        "InventoryItem", back_populates="session", lazy="selectin"
    )

    __table_args__ = (
        Index("ix_game_sessions_campaign_number", "campaign_id", "session_number"),
    )

    def __repr__(self) -> str:
        return f"<GameSession #{self.session_number} [{self.status}]>"


# ---------------------------------------------------------------------------
# CombatState
# ---------------------------------------------------------------------------

class CombatState(Base):
    __tablename__ = "combat_states"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active"
    )  # "active" | "ended"
    current_turn_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    round_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    initiative_order: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    combatants: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True, comment="Current stats per combatant"
    )

    # relationships
    session: Mapped["GameSession"] = relationship(
        "GameSession", back_populates="combat_states"
    )

    def __repr__(self) -> str:
        return f"<CombatState round={self.round_number} [{self.status}]>"


# ---------------------------------------------------------------------------
# SessionLog
# ---------------------------------------------------------------------------

class SessionLog(Base):
    __tablename__ = "session_logs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    entry_type: Mapped[str] = mapped_column(
        String(16), nullable=False
    )  # "combat" | "probe" | "scene" | "lore" | "quest" | "whisper" | "system"
    data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    # relationships
    session: Mapped["GameSession"] = relationship(
        "GameSession", back_populates="logs"
    )

    __table_args__ = (
        Index("ix_session_logs_session_type", "session_id", "entry_type"),
    )

    def __repr__(self) -> str:
        return f"<SessionLog {self.entry_type} @ {self.timestamp}>"


# ---------------------------------------------------------------------------
# APAward
# ---------------------------------------------------------------------------

class APAward(Base):
    __tablename__ = "ap_awards"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    character_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("characters.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)

    # relationships
    session: Mapped["GameSession"] = relationship(
        "GameSession", back_populates="ap_awards"
    )
    character: Mapped["Character"] = relationship(  # noqa: F821
        "Character", back_populates="ap_awards"
    )

    def __repr__(self) -> str:
        return f"<APAward {self.amount} AP -> character={self.character_id}>"

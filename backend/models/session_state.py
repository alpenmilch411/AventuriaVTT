"""Live session, combat state, session logs, AP awards, and session players/statistics."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, DateTime, Text, ForeignKey, Integer, Index, func
from sqlalchemy import JSON, UniqueConstraint
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
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    gm_user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    campaign_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )
    session_code: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="lobby"
    )  # "lobby" | "active" | "paused" | "ended" | "complete"
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    completion_snapshot: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True
    )
    statistics: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True
    )
    gm_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recap_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    gm: Mapped["User"] = relationship(  # noqa: F821
        "User", back_populates="gm_sessions"
    )
    campaign: Mapped[Optional["Campaign"]] = relationship(  # noqa: F821
        "Campaign", back_populates="sessions"
    )
    session_players: Mapped[list["SessionPlayer"]] = relationship(
        "SessionPlayer", back_populates="session", lazy="selectin",
        cascade="all, delete-orphan",
    )
    session_statistics: Mapped[list["SessionStatistics"]] = relationship(
        "SessionStatistics", back_populates="session", lazy="selectin",
        cascade="all, delete-orphan",
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

    def __repr__(self) -> str:
        return f"<GameSession {self.name!r} [{self.status}]>"


# ---------------------------------------------------------------------------
# SessionPlayer
# ---------------------------------------------------------------------------

class SessionPlayer(Base):
    __tablename__ = "session_players"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"),
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
    )  # "active" | "left" | "removed"
    character_snapshot: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
        comment="Snapshot of character state at join time for rollback",
    )

    __table_args__ = (
        UniqueConstraint("session_id", "user_id", name="uq_session_user"),
    )

    # relationships
    session: Mapped["GameSession"] = relationship(
        "GameSession", back_populates="session_players"
    )
    user: Mapped["User"] = relationship(  # noqa: F821
        "User", back_populates="session_players"
    )
    character: Mapped[Optional["Character"]] = relationship(  # noqa: F821
        "Character"
    )

    def __repr__(self) -> str:
        return f"<SessionPlayer session={self.session_id} user={self.user_id}>"


# ---------------------------------------------------------------------------
# SessionStatistics
# ---------------------------------------------------------------------------

class SessionStatistics(Base):
    __tablename__ = "session_statistics"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    character_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("characters.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    kills: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    damage_dealt: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    damage_taken: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    dice_rolls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    critical_successes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    critical_failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    spells_cast: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    liturgies_cast: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    conditions_suffered: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    schip_spent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    probes_attempted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    probes_succeeded: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    healing_done: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    items_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    extra: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # relationships
    session: Mapped["GameSession"] = relationship(
        "GameSession", back_populates="session_statistics"
    )
    character: Mapped["Character"] = relationship("Character")  # noqa: F821
    user: Mapped["User"] = relationship("User")  # noqa: F821

    def __repr__(self) -> str:
        return f"<SessionStatistics session={self.session_id} char={self.character_id}>"


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


# ---------------------------------------------------------------------------
# SessionSnapshot — persists in-memory session state for restart resilience
# ---------------------------------------------------------------------------

class SessionSnapshot(Base):
    __tablename__ = "session_snapshots"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    session_code: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False, index=True
    )
    snapshot_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    def __repr__(self) -> str:
        return f"<SessionSnapshot session={self.session_code} @ {self.updated_at}>"


# ---------------------------------------------------------------------------
# SessionFeedback — post-session player ratings
# ---------------------------------------------------------------------------

class SessionFeedback(Base):
    __tablename__ = "session_feedback"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    character_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("characters.id", ondelete="SET NULL"),
        nullable=True,
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-5
    mvp_character_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("characters.id", ondelete="SET NULL"),
        nullable=True,
    )
    comment: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    # relationships
    session: Mapped["GameSession"] = relationship("GameSession")
    user: Mapped["User"] = relationship("User")  # noqa: F821
    character: Mapped[Optional["Character"]] = relationship(  # noqa: F821
        "Character", foreign_keys=[character_id]
    )
    mvp_character: Mapped[Optional["Character"]] = relationship(  # noqa: F821
        "Character", foreign_keys=[mvp_character_id]
    )

    __table_args__ = (
        UniqueConstraint("session_id", "user_id", name="uq_session_feedback_user"),
    )

    def __repr__(self) -> str:
        return f"<SessionFeedback session={self.session_id} user={self.user_id} rating={self.rating}>"

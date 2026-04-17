"""Character model – full DSA5 character lifecycle."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, DateTime, Text, ForeignKey, Integer, Boolean, Index, func
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Character(Base):
    __tablename__ = "characters"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    species: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    species_variant: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    profession: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    profession_variant: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    culture: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    experience_grade: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    total_ap: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    available_ap: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="created"
    )  # "created" | "active" | "resting" | "retired" | "dead"
    portrait_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # -- DSA5 core data stored as JSON --
    attributes: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True, comment="MU/KL/IN/CH/FF/GE/KO/KK values"
    )
    derived_values: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
        comment="LeP_max, AsP_max, KaP_max, INI_basis, GS, AW, SK, ZK, Schip",
    )
    combat_values: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    combat_techniques: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True, comment="dict of technique_name -> KTW (e.g. {'Hiebwaffen': 12, 'Dolche': 8})"
    )
    talents: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True, comment="dict of talent_id -> FW"
    )
    spells: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    liturgies: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    special_abilities: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    advantages: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    disadvantages: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    basis_inventory: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    languages: Mapped[Optional[list]] = mapped_column(
        JSON, nullable=True,
        comment="Languages and scripts [{name, level}] — from culture + purchases",
    )

    # Live session state — persisted between sessions
    current_vitals: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True,
        comment="Current LeP, AsP, KaP, Schip — updated in real-time during play",
    )
    conditions: Mapped[Optional[list]] = mapped_column(
        JSON, nullable=True,
        comment="Active conditions with levels [{name, level}]",
    )
    active_buffs: Mapped[Optional[list]] = mapped_column(
        JSON, nullable=True, default=list,
        comment="Active temporary buffs [{id, stat, value, source, applied_at, expires_at, duration_minutes}]",
    )

    locked_session_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("game_sessions.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    creation_finalized: Mapped[bool] = mapped_column(Boolean, default=False)
    creation_ap_spent: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    death_record: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # -- relationships --
    locked_session: Mapped[Optional["GameSession"]] = relationship(  # noqa: F821
        "GameSession", foreign_keys=[locked_session_id]
    )
    owner: Mapped["User"] = relationship(  # noqa: F821
        "User", back_populates="characters"
    )
    ap_awards: Mapped[list["APAward"]] = relationship(  # noqa: F821
        "APAward", back_populates="character", lazy="selectin"
    )
    inventory_items: Mapped[list["InventoryItem"]] = relationship(  # noqa: F821
        "InventoryItem", back_populates="character", lazy="selectin"
    )

    __table_args__ = (
        Index("ix_characters_user_status", "user_id", "status"),
    )

    def __repr__(self) -> str:
        return f"<Character {self.name!r} ({self.status})>"

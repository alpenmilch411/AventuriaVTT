"""NPC registry model."""

import uuid
from typing import Optional

from sqlalchemy import String, Text, ForeignKey, Integer, Boolean, Index
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class NPC(Base):
    __tablename__ = "npcs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    campaign_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("campaigns.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    adventure_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("adventures.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    portrait_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    icon_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    personality_tags: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    voice_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    knows: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    secrets: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    attitude_to_party: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    attitude_history: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    relationships: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    scene_ids: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    is_combatant: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    creature_template_id: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True
    )
    first_met_session: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tags: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    gm_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    known_to_players: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    player_visible_info: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    campaign: Mapped[Optional["Campaign"]] = relationship(  # noqa: F821
        "Campaign", back_populates="npcs"
    )
    adventure: Mapped[Optional["Adventure"]] = relationship(  # noqa: F821
        "Adventure", back_populates="npcs"
    )

    __table_args__ = (
        Index("ix_npcs_campaign_name", "campaign_id", "name"),
    )

    def __repr__(self) -> str:
        return f"<NPC {self.name!r}>"

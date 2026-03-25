"""Map, token, and trigger models."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, DateTime, Text, ForeignKey, Integer, Float, Boolean, Index, func
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


# ---------------------------------------------------------------------------
# GameMap
# ---------------------------------------------------------------------------

class GameMap(Base):
    __tablename__ = "game_maps"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    campaign_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("campaigns.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    adventure_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("adventures.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    image_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    grid_config: Mapped[Optional[dict]] = mapped_column(
        JSON, nullable=True, comment="type, width, height, cell_px"
    )
    walls: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    difficult_terrain: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    initial_fog: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, default=True)
    landmarks: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    # relationships
    campaign: Mapped[Optional["Campaign"]] = relationship(  # noqa: F821
        "Campaign", back_populates="maps"
    )
    adventure: Mapped[Optional["Adventure"]] = relationship(  # noqa: F821
        "Adventure", back_populates="maps"
    )
    tokens: Mapped[list["MapToken"]] = relationship(
        "MapToken", back_populates="game_map", lazy="selectin",
        cascade="all, delete-orphan",
    )
    triggers: Mapped[list["MapTrigger"]] = relationship(
        "MapTrigger", back_populates="game_map", lazy="selectin",
        cascade="all, delete-orphan",
    )
    def __repr__(self) -> str:
        return f"<GameMap {self.name!r}>"


# ---------------------------------------------------------------------------
# MapToken
# ---------------------------------------------------------------------------

class MapToken(Base):
    __tablename__ = "map_tokens"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    map_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("game_maps.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    entity_type: Mapped[str] = mapped_column(
        String(16), nullable=False
    )  # "player" | "creature" | "npc" | "item" | "landmark"
    entity_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )
    name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    icon_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    position_x: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    position_y: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    token_size: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    visible_to_players: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    conditions: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    current_lep: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_lep: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # relationships
    game_map: Mapped["GameMap"] = relationship("GameMap", back_populates="tokens")

    def __repr__(self) -> str:
        return f"<MapToken {self.name!r} @ ({self.position_x}, {self.position_y})>"


# ---------------------------------------------------------------------------
# MapTrigger
# ---------------------------------------------------------------------------

class MapTrigger(Base):
    __tablename__ = "map_triggers"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    map_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("game_maps.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    position_x: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    position_y: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    trigger_type: Mapped[str] = mapped_column(
        String(16), nullable=False
    )  # "trap" | "encounter" | "event" | "discovery"
    name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    gm_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    auto_probe: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    on_trigger: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    on_success: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    on_failure: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    visible_to_gm: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    revealed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    one_shot: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    trigger_on: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # relationships
    game_map: Mapped["GameMap"] = relationship("GameMap", back_populates="triggers")

    def __repr__(self) -> str:
        return f"<MapTrigger {self.name!r} ({self.trigger_type})>"

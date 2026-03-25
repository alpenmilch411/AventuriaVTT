"""Inventory and equipment models."""

import uuid
from typing import Optional

from sqlalchemy import String, Text, ForeignKey, Integer, Boolean, Index
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


# ---------------------------------------------------------------------------
# InventoryItem
# ---------------------------------------------------------------------------

class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    character_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("characters.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )
    campaign_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=True, index=True,
    )
    session_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("game_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    item_template_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    equipped: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    properties: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # relationships
    character: Mapped[Optional["Character"]] = relationship(  # noqa: F821
        "Character", back_populates="inventory_items"
    )
    campaign: Mapped[Optional["Campaign"]] = relationship(  # noqa: F821
        "Campaign", back_populates="campaign_inventory_items",
        foreign_keys=[campaign_id],
    )
    session: Mapped[Optional["GameSession"]] = relationship(  # noqa: F821
        "GameSession", back_populates="inventory_items"
    )

    __table_args__ = (
        Index("ix_inventory_items_character", "character_id"),
    )

    def __repr__(self) -> str:
        return f"<InventoryItem {self.name!r} x{self.quantity}>"


# ---------------------------------------------------------------------------
# GroupInventory
# ---------------------------------------------------------------------------

class GroupInventory(Base):
    __tablename__ = "group_inventories"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    campaign_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False, unique=True, index=True,
    )
    items: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    # relationships
    campaign: Mapped["Campaign"] = relationship(  # noqa: F821
        "Campaign", back_populates="group_inventory"
    )

    def __repr__(self) -> str:
        return f"<GroupInventory campaign={self.campaign_id}>"

"""User account model."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, DateTime, Index, Text, func
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    username: Mapped[str] = mapped_column(String(64), nullable=False)
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    preferred_complexity: Mapped[str] = mapped_column(
        String(16), nullable=False, default="standard"
    )  # "basic" | "standard" | "advanced"
    notification_settings: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    theme: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    # -- relationships --
    characters: Mapped[list["Character"]] = relationship(  # noqa: F821
        "Character", back_populates="owner", lazy="selectin"
    )
    created_groups: Mapped[list["Group"]] = relationship(  # noqa: F821
        "Group", back_populates="creator", lazy="selectin"
    )
    gm_campaigns: Mapped[list["Campaign"]] = relationship(  # noqa: F821
        "Campaign", back_populates="gm", lazy="selectin"
    )
    campaign_players: Mapped[list["CampaignPlayer"]] = relationship(  # noqa: F821
        "CampaignPlayer", back_populates="user", lazy="selectin"
    )
    group_memberships: Mapped[list["GroupMember"]] = relationship(  # noqa: F821
        "GroupMember", back_populates="user", lazy="selectin"
    )
    created_adventures: Mapped[list["Adventure"]] = relationship(  # noqa: F821
        "Adventure", back_populates="creator", lazy="selectin"
    )

    __table_args__ = (
        Index("ix_users_username", "username"),
    )

    def __repr__(self) -> str:
        return f"<User {self.username!r}>"

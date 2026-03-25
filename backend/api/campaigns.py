"""Campaign CRUD, groups, lore, quests, and timeline endpoints."""

import secrets
import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from database import get_db
from models.user import User
from models.campaign import (
    Campaign, CampaignPlayer, Group, GroupMember,
    LoreEntry, Quest, TimelineEvent,
)
from models.character import Character

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_code(length: int = 8) -> str:
    return secrets.token_urlsafe(length)[:length].upper()


async def _get_campaign_as_gm(
    campaign_id: str, user: User, db: AsyncSession
) -> Campaign:
    result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id, Campaign.gm_user_id == user.id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found or not GM")
    return campaign


async def _get_campaign_as_member(
    campaign_id: str, user: User, db: AsyncSession
) -> Campaign:
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    # Check GM or player
    if campaign.gm_user_id != user.id:
        player_check = await db.execute(
            select(CampaignPlayer).where(
                CampaignPlayer.campaign_id == campaign_id,
                CampaignPlayer.user_id == user.id,
            )
        )
        if not player_check.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this campaign")
    return campaign


# ---------------------------------------------------------------------------
# Pydantic schemas — Campaign
# ---------------------------------------------------------------------------

class CampaignCreate(BaseModel):
    name: str
    description: Optional[str] = None
    group_id: Optional[str] = None
    complexity_level: Optional[str] = None
    optional_rules: Optional[dict] = None


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    complexity_level: Optional[str] = None
    optional_rules: Optional[dict] = None
    status: Optional[str] = None
    weather: Optional[str] = None
    world_clock: Optional[dict] = None


class CampaignResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    group_id: Optional[str] = None
    gm_user_id: str
    adventure_id: Optional[str] = None
    complexity_level: Optional[str] = None
    optional_rules: Optional[dict] = None
    status: str
    campaign_code: str
    world_clock: Optional[dict] = None
    weather: Optional[str] = None
    created_at: datetime
    last_played: Optional[datetime] = None

    model_config = {"from_attributes": True}


class JoinCampaignRequest(BaseModel):
    campaign_code: str
    character_id: Optional[str] = None


class AddPlayerRequest(BaseModel):
    user_id: str
    character_id: str


class AssignCharacterRequest(BaseModel):
    character_id: str


class CampaignPlayerResponse(BaseModel):
    id: str
    campaign_id: str
    user_id: str
    character_id: str
    status: str
    joined_at: datetime

    model_config = {"from_attributes": True}


# -- Group schemas --

class GroupCreate(BaseModel):
    name: str


class GroupResponse(BaseModel):
    id: str
    name: str
    created_by: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class GroupMemberAdd(BaseModel):
    user_id: str
    role: str = "member"


class GroupMemberResponse(BaseModel):
    id: str
    group_id: str
    user_id: str
    display_name: Optional[str] = None
    role: str
    joined_at: datetime

    model_config = {"from_attributes": True}


# -- Lore schemas --

class LoreCreate(BaseModel):
    category: str
    title: str
    player_text: Optional[str] = None
    gm_text: Optional[str] = None
    first_encountered: Optional[str] = None
    tags: Optional[list] = None
    linked_entries: Optional[list] = None
    linked_npcs: Optional[list] = None
    linked_quests: Optional[list] = None


class LoreUpdate(BaseModel):
    category: Optional[str] = None
    title: Optional[str] = None
    player_text: Optional[str] = None
    gm_text: Optional[str] = None
    tags: Optional[list] = None
    linked_entries: Optional[list] = None
    linked_npcs: Optional[list] = None
    linked_quests: Optional[list] = None


class LoreRevealRequest(BaseModel):
    reveal_text: str
    visible_to: Optional[list[uuid.UUID]] = None  # None = all players


class LoreResponse(BaseModel):
    id: str
    campaign_id: str
    category: str
    title: str
    player_text: Optional[str] = None
    gm_text: Optional[str] = None
    first_encountered: Optional[str] = None
    last_updated: Optional[datetime] = None
    tags: Optional[list] = None
    linked_entries: Optional[list] = None
    linked_npcs: Optional[list] = None
    linked_quests: Optional[list] = None
    reveals: Optional[list] = None

    model_config = {"from_attributes": True}


# -- Quest schemas --

class QuestCreate(BaseModel):
    title: str
    description: Optional[str] = None
    type: str = "side"
    assigned_to: Optional[str] = None
    given_by: Optional[str] = None
    reward_description: Optional[str] = None
    objectives: Optional[list] = None
    gm_notes: Optional[str] = None
    created_session: Optional[int] = None


class QuestUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    reward_description: Optional[str] = None
    objectives: Optional[list] = None
    gm_notes: Optional[str] = None
    completed_session: Optional[int] = None


class QuestResponse(BaseModel):
    id: str
    campaign_id: str
    title: str
    description: Optional[str] = None
    type: str
    assigned_to: Optional[str] = None
    status: str
    given_by: Optional[str] = None
    reward_description: Optional[str] = None
    objectives: Optional[list] = None
    gm_notes: Optional[str] = None
    created_session: Optional[int] = None
    completed_session: Optional[int] = None

    model_config = {"from_attributes": True}


# -- Timeline schemas --

class TimelineCreate(BaseModel):
    game_date: Optional[str] = None
    game_time: Optional[str] = None
    session_number: Optional[int] = None
    real_date: Optional[date] = None
    event_type: Optional[str] = None
    title: str
    description: Optional[str] = None
    characters_involved: Optional[list] = None
    npcs_involved: Optional[list] = None
    linked_lore: Optional[list] = None
    linked_quest: Optional[str] = None


class TimelineResponse(BaseModel):
    id: str
    campaign_id: str
    game_date: Optional[str] = None
    game_time: Optional[str] = None
    session_number: Optional[int] = None
    real_date: Optional[date] = None
    event_type: Optional[str] = None
    title: str
    description: Optional[str] = None
    characters_involved: Optional[list] = None
    npcs_involved: Optional[list] = None
    linked_lore: Optional[list] = None
    linked_quest: Optional[str] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Campaign endpoints
# ---------------------------------------------------------------------------

@router.post("", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    body: CampaignCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new campaign. The creating user becomes GM."""
    campaign = Campaign(
        name=body.name,
        description=body.description,
        group_id=body.group_id,
        gm_user_id=current_user.id,
        complexity_level=body.complexity_level,
        optional_rules=body.optional_rules,
        campaign_code=_generate_code(),
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return campaign


@router.get("", response_model=list[CampaignResponse])
async def list_campaigns(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List campaigns where user is GM or player."""
    # As GM
    gm_result = await db.execute(
        select(Campaign).where(Campaign.gm_user_id == current_user.id)
    )
    gm_campaigns = list(gm_result.scalars().all())

    # As player
    player_result = await db.execute(
        select(Campaign)
        .join(CampaignPlayer, CampaignPlayer.campaign_id == Campaign.id)
        .where(CampaignPlayer.user_id == current_user.id)
    )
    player_campaigns = list(player_result.scalars().all())

    # Merge, deduplicate
    seen: set[uuid.UUID] = set()
    merged: list[Campaign] = []
    for c in gm_campaigns + player_campaigns:
        if c.id not in seen:
            seen.add(c.id)
            merged.append(c)
    return merged


@router.get("/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get campaign detail (must be member)."""
    return await _get_campaign_as_member(campaign_id, current_user, db)


@router.put("/{campaign_id}", response_model=CampaignResponse)
async def update_campaign(
    campaign_id: str,
    body: CampaignUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update campaign settings (GM only)."""
    campaign = await _get_campaign_as_gm(campaign_id, current_user, db)
    update_data = body.model_dump(exclude_unset=True)

    if "status" in update_data and update_data["status"] not in ("active", "paused", "archived"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="status must be active, paused, or archived",
        )

    for field, value in update_data.items():
        setattr(campaign, field, value)

    await db.commit()
    await db.refresh(campaign)
    return campaign


@router.post("/join")
async def join_campaign_by_code(
    body: JoinCampaignRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Join a campaign using just the campaign code."""
    result = await db.execute(
        select(Campaign).where(Campaign.campaign_code == body.campaign_code)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kampagne nicht gefunden. Prüfe den Code.")

    # Check not already a member (as GM or player)
    if str(campaign.gm_user_id) == str(current_user.id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Du bist bereits Spielleiter dieser Kampagne.")

    existing = await db.execute(
        select(CampaignPlayer).where(
            CampaignPlayer.campaign_id == campaign.id,
            CampaignPlayer.user_id == current_user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Du bist bereits in dieser Kampagne.")

    # If character_id provided, verify ownership
    character_id = body.character_id
    if character_id:
        char_result = await db.execute(
            select(Character).where(
                Character.id == character_id,
                Character.user_id == current_user.id,
            )
        )
        if not char_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Charakter nicht gefunden")

    player = CampaignPlayer(
        id=str(uuid.uuid4()),
        campaign_id=str(campaign.id),
        user_id=str(current_user.id),
        character_id=character_id or "",
        status="active",
    )
    db.add(player)
    await db.commit()

    return {"message": "Erfolgreich beigetreten!", "campaign_name": campaign.name, "campaign_id": str(campaign.id)}


@router.post("/{campaign_id}/join", response_model=CampaignPlayerResponse)
async def join_campaign(
    campaign_id: str,
    body: JoinCampaignRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Join a campaign via campaign_code (legacy, with campaign_id in path)."""
    result = await db.execute(
        select(Campaign).where(
            Campaign.id == campaign_id,
            Campaign.campaign_code == body.campaign_code,
        )
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid campaign or code")

    existing = await db.execute(
        select(CampaignPlayer).where(
            CampaignPlayer.campaign_id == campaign_id,
            CampaignPlayer.user_id == current_user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already in this campaign")

    if body.character_id:
        char_result = await db.execute(
            select(Character).where(
                Character.id == body.character_id,
                Character.user_id == current_user.id,
            )
        )
        if not char_result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")

    player = CampaignPlayer(
        id=str(uuid.uuid4()),
        campaign_id=campaign_id,
        user_id=str(current_user.id),
        character_id=body.character_id or "",
        status="active",
    )
    db.add(player)
    await db.commit()
    await db.refresh(player)
    return player


@router.post("/{campaign_id}/players", response_model=CampaignPlayerResponse)
async def add_player(
    campaign_id: str,
    body: AddPlayerRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Invite/add a player to campaign (GM only)."""
    await _get_campaign_as_gm(campaign_id, current_user, db)

    existing = await db.execute(
        select(CampaignPlayer).where(
            CampaignPlayer.campaign_id == campaign_id,
            CampaignPlayer.user_id == body.user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Player already in campaign")

    player = CampaignPlayer(
        campaign_id=campaign_id,
        user_id=body.user_id,
        character_id=body.character_id,
    )
    db.add(player)
    await db.commit()
    await db.refresh(player)
    return player


@router.delete("/{campaign_id}/players/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_player(
    campaign_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove player from campaign (GM only)."""
    await _get_campaign_as_gm(campaign_id, current_user, db)

    result = await db.execute(
        select(CampaignPlayer).where(
            CampaignPlayer.campaign_id == campaign_id,
            CampaignPlayer.user_id == user_id,
        )
    )
    player = result.scalar_one_or_none()
    if not player:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not in campaign")

    await db.delete(player)
    await db.commit()


@router.put("/{campaign_id}/players/{user_id}/character", response_model=CampaignPlayerResponse)
async def assign_character(
    campaign_id: str,
    user_id: str,
    body: AssignCharacterRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Assign or change a player's character (GM or the player themselves)."""
    # Allow GM or the player themselves
    campaign = await _get_campaign_as_member(campaign_id, current_user, db)
    if current_user.id != user_id and campaign.gm_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only GM or the player can change character")

    result = await db.execute(
        select(CampaignPlayer).where(
            CampaignPlayer.campaign_id == campaign_id,
            CampaignPlayer.user_id == user_id,
        )
    )
    player = result.scalar_one_or_none()
    if not player:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not in campaign")

    player.character_id = body.character_id
    await db.commit()
    await db.refresh(player)
    return player


@router.post("/{campaign_id}/end", response_model=CampaignResponse)
async def end_campaign(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """End/archive a campaign (GM only). Triggers carry-over flow."""
    campaign = await _get_campaign_as_gm(campaign_id, current_user, db)
    campaign.status = "archived"
    await db.commit()
    await db.refresh(campaign)
    return campaign


# ---------------------------------------------------------------------------
# Group endpoints
# ---------------------------------------------------------------------------

@router.post("/groups", response_model=GroupResponse, status_code=status.HTTP_201_CREATED, tags=["groups"])
async def create_group(
    body: GroupCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new player group."""
    group = Group(name=body.name, created_by=current_user.id)
    db.add(group)
    await db.flush()

    # Creator is automatically admin
    member = GroupMember(
        group_id=group.id,
        user_id=current_user.id,
        role="admin",
    )
    db.add(member)
    await db.commit()
    await db.refresh(group)
    return group


@router.get("/groups", response_model=list[GroupResponse], tags=["groups"])
async def list_groups(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List groups the current user belongs to."""
    result = await db.execute(
        select(Group)
        .join(GroupMember, GroupMember.group_id == Group.id)
        .where(GroupMember.user_id == current_user.id)
    )
    return result.scalars().all()


@router.post("/groups/{group_id}/members", response_model=GroupMemberResponse, tags=["groups"])
async def add_group_member(
    group_id: str,
    body: GroupMemberAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a member to a group."""
    # Verify current user is admin of the group
    admin_check = await db.execute(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id,
            GroupMember.role == "admin",
        )
    )
    if not admin_check.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Must be group admin")

    existing = await db.execute(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == body.user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already in group")

    member = GroupMember(
        group_id=group_id,
        user_id=body.user_id,
        role=body.role,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


@router.delete("/groups/{group_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["groups"])
async def remove_group_member(
    group_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a member from a group (admin only)."""
    admin_check = await db.execute(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id,
            GroupMember.role == "admin",
        )
    )
    if not admin_check.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Must be group admin")

    result = await db.execute(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    await db.delete(member)
    await db.commit()


# ---------------------------------------------------------------------------
# Lore endpoints
# ---------------------------------------------------------------------------

@router.get("/{campaign_id}/lore", response_model=list[LoreResponse])
async def list_lore(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all lore entries for a campaign."""
    await _get_campaign_as_member(campaign_id, current_user, db)
    result = await db.execute(
        select(LoreEntry).where(LoreEntry.campaign_id == campaign_id)
    )
    return result.scalars().all()


@router.post("/{campaign_id}/lore", response_model=LoreResponse, status_code=status.HTTP_201_CREATED)
async def create_lore(
    campaign_id: str,
    body: LoreCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a lore entry (GM only)."""
    await _get_campaign_as_gm(campaign_id, current_user, db)

    valid_categories = ("person", "location", "discovery", "event", "item", "faction")
    if body.category not in valid_categories:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"category must be one of {valid_categories}",
        )

    entry = LoreEntry(
        campaign_id=campaign_id,
        **body.model_dump(),
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.put("/{campaign_id}/lore/{entry_id}", response_model=LoreResponse)
async def update_lore(
    campaign_id: str,
    entry_id: str,
    body: LoreUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a lore entry (GM only)."""
    await _get_campaign_as_gm(campaign_id, current_user, db)
    result = await db.execute(
        select(LoreEntry).where(
            LoreEntry.id == entry_id,
            LoreEntry.campaign_id == campaign_id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lore entry not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    entry.last_updated = datetime.utcnow()

    await db.commit()
    await db.refresh(entry)
    return entry


@router.post("/{campaign_id}/lore/{entry_id}/reveal", response_model=LoreResponse)
async def reveal_lore(
    campaign_id: str,
    entry_id: str,
    body: LoreRevealRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reveal lore to players (GM only)."""
    await _get_campaign_as_gm(campaign_id, current_user, db)
    result = await db.execute(
        select(LoreEntry).where(
            LoreEntry.id == entry_id,
            LoreEntry.campaign_id == campaign_id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lore entry not found")

    reveals = list(entry.reveals or [])
    reveals.append({
        "text": body.reveal_text,
        "visible_to": [str(uid) for uid in body.visible_to] if body.visible_to else None,
        "revealed_at": datetime.utcnow().isoformat(),
    })
    entry.reveals = reveals
    entry.last_updated = datetime.utcnow()

    await db.commit()
    await db.refresh(entry)
    return entry


# ---------------------------------------------------------------------------
# Quest endpoints
# ---------------------------------------------------------------------------

@router.get("/{campaign_id}/quests", response_model=list[QuestResponse])
async def list_quests(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all quests for a campaign."""
    await _get_campaign_as_member(campaign_id, current_user, db)
    result = await db.execute(
        select(Quest).where(Quest.campaign_id == campaign_id)
    )
    return result.scalars().all()


@router.post("/{campaign_id}/quests", response_model=QuestResponse, status_code=status.HTTP_201_CREATED)
async def create_quest(
    campaign_id: str,
    body: QuestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a quest (GM only)."""
    await _get_campaign_as_gm(campaign_id, current_user, db)

    valid_types = ("main", "side", "personal")
    if body.type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"type must be one of {valid_types}",
        )

    quest = Quest(campaign_id=campaign_id, **body.model_dump())
    db.add(quest)
    await db.commit()
    await db.refresh(quest)
    return quest


@router.put("/{campaign_id}/quests/{quest_id}", response_model=QuestResponse)
async def update_quest(
    campaign_id: str,
    quest_id: str,
    body: QuestUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a quest (GM only)."""
    await _get_campaign_as_gm(campaign_id, current_user, db)
    result = await db.execute(
        select(Quest).where(Quest.id == quest_id, Quest.campaign_id == campaign_id)
    )
    quest = result.scalar_one_or_none()
    if not quest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quest not found")

    update_data = body.model_dump(exclude_unset=True)
    if "status" in update_data and update_data["status"] not in ("active", "completed", "failed", "abandoned"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="status must be active, completed, failed, or abandoned",
        )

    for field, value in update_data.items():
        setattr(quest, field, value)

    await db.commit()
    await db.refresh(quest)
    return quest


# ---------------------------------------------------------------------------
# Timeline endpoints
# ---------------------------------------------------------------------------

@router.get("/{campaign_id}/timeline", response_model=list[TimelineResponse])
async def list_timeline(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get timeline events for a campaign."""
    await _get_campaign_as_member(campaign_id, current_user, db)
    result = await db.execute(
        select(TimelineEvent)
        .where(TimelineEvent.campaign_id == campaign_id)
        .order_by(TimelineEvent.session_number, TimelineEvent.game_date)
    )
    return result.scalars().all()


@router.post("/{campaign_id}/timeline", response_model=TimelineResponse, status_code=status.HTTP_201_CREATED)
async def create_timeline_event(
    campaign_id: str,
    body: TimelineCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a timeline event (GM only)."""
    await _get_campaign_as_gm(campaign_id, current_user, db)

    event = TimelineEvent(campaign_id=campaign_id, **body.model_dump())
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


# ---------------------------------------------------------------------------
# Campaign players with character data (for GM overview)
# ---------------------------------------------------------------------------

@router.get("/{campaign_id}/players-detail")
async def get_campaign_players_detail(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all players in a campaign with their character details. GM only."""
    campaign = await _get_campaign_as_member(campaign_id, current_user, db)

    result = await db.execute(
        select(CampaignPlayer).where(CampaignPlayer.campaign_id == campaign_id)
    )
    campaign_players = result.scalars().all()

    players = []
    for cp in campaign_players:
        # Get user info
        user_result = await db.execute(select(User).where(User.id == cp.user_id))
        user = user_result.scalar_one_or_none()

        # Get character info
        char_data = None
        current_vitals = {}
        if cp.character_id:
            char_result = await db.execute(select(Character).where(Character.id == cp.character_id))
            char = char_result.scalar_one_or_none()
            if char:
                char_data = {
                    "id": char.id,
                    "name": char.name,
                    "species": char.species,
                    "profession": char.profession,
                    "culture": char.culture,
                    "attributes": char.attributes,
                    "derived_values": char.derived_values,
                    "combat_values": char.combat_values,
                    "combat_techniques": char.combat_techniques,
                    "talents": char.talents,
                    "spells": char.spells,
                    "liturgies": char.liturgies,
                    "special_abilities": char.special_abilities,
                    "advantages": char.advantages,
                    "disadvantages": char.disadvantages,
                    "basis_inventory": char.basis_inventory,
                    "conditions": char.conditions or [],
                    "status": char.status,
                    "total_ap": char.total_ap,
                    "available_ap": char.available_ap,
                    "experience_grade": char.experience_grade,
                }
                current_vitals = char.current_vitals or {}

        dv = (char_data or {}).get("derived_values") or {}
        # Normalised vitals object — same shape as GET /api/characters/:id
        vitals_obj = {
            "lep": current_vitals.get("lep", dv.get("LeP_max", 0)),
            "asp": current_vitals.get("asp", dv.get("AsP_max", 0)),
            "kap": current_vitals.get("kap", dv.get("KaP_max", 0)),
            "schip": current_vitals.get("schip", dv.get("Schip", 3)),
        }
        players.append({
            "user_id": cp.user_id,
            "username": user.username if user else "Unbekannt",
            "character_id": cp.character_id,
            "character": char_data,
            "status": cp.status,
            "connected": False,  # Will be updated by WebSocket
            "current_vitals": vitals_obj,
            # Keep flat fields for backwards compatibility during migration
            "current_lep": vitals_obj["lep"],
            "current_asp": vitals_obj["asp"],
            "current_kap": vitals_obj["kap"],
            "current_schip": vitals_obj["schip"],
            "conditions": (char_data or {}).get("conditions", []),
        })

    return players

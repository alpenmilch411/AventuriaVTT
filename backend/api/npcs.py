"""NPC registry — CRUD, visibility, and relationship map endpoints."""

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from database import get_db
from models.user import User
from models.campaign import Campaign, CampaignPlayer
from models.npc import NPC

router = APIRouter(prefix="/api/npcs", tags=["npcs"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class NPCCreate(BaseModel):
    campaign_id: Optional[str] = None
    adventure_id: Optional[str] = None
    name: str
    portrait_url: Optional[str] = None
    icon_id: Optional[str] = None
    personality_tags: Optional[list] = None
    voice_notes: Optional[str] = None
    knows: Optional[list] = None
    secrets: Optional[list] = None
    attitude_to_party: Optional[str] = None
    relationships: Optional[list] = None
    location: Optional[str] = None
    scene_ids: Optional[list] = None
    is_combatant: bool = False
    creature_template_id: Optional[str] = None
    first_met_session: Optional[int] = None
    tags: Optional[list] = None
    gm_notes: Optional[str] = None
    known_to_players: bool = False
    player_visible_info: Optional[str] = None


class NPCUpdate(BaseModel):
    name: Optional[str] = None
    portrait_url: Optional[str] = None
    icon_id: Optional[str] = None
    personality_tags: Optional[list] = None
    voice_notes: Optional[str] = None
    knows: Optional[list] = None
    secrets: Optional[list] = None
    attitude_to_party: Optional[str] = None
    attitude_history: Optional[list] = None
    relationships: Optional[list] = None
    location: Optional[str] = None
    scene_ids: Optional[list] = None
    is_combatant: Optional[bool] = None
    creature_template_id: Optional[str] = None
    tags: Optional[list] = None
    gm_notes: Optional[str] = None
    known_to_players: Optional[bool] = None
    player_visible_info: Optional[str] = None


class NPCResponse(BaseModel):
    id: str
    campaign_id: Optional[str] = None
    adventure_id: Optional[str] = None
    name: str
    portrait_url: Optional[str] = None
    icon_id: Optional[str] = None
    personality_tags: Optional[list] = None
    voice_notes: Optional[str] = None
    knows: Optional[list] = None
    secrets: Optional[list] = None
    attitude_to_party: Optional[str] = None
    attitude_history: Optional[list] = None
    relationships: Optional[list] = None
    location: Optional[str] = None
    scene_ids: Optional[list] = None
    is_combatant: bool
    creature_template_id: Optional[str] = None
    first_met_session: Optional[int] = None
    tags: Optional[list] = None
    gm_notes: Optional[str] = None
    known_to_players: bool
    player_visible_info: Optional[str] = None

    model_config = {"from_attributes": True}


class NPCPlayerView(BaseModel):
    """Reduced NPC view for players — hides GM-only fields."""
    id: str
    name: str
    portrait_url: Optional[str] = None
    icon_id: Optional[str] = None
    attitude_to_party: Optional[str] = None
    location: Optional[str] = None
    player_visible_info: Optional[str] = None
    known_to_players: bool


class RevealNPCRequest(BaseModel):
    known_to_players: bool = True
    player_visible_info: Optional[str] = None


class RelationshipNode(BaseModel):
    npc_id: str
    name: str
    attitude_to_party: Optional[str] = None
    relationships: Optional[list] = None


class RelationshipMapResponse(BaseModel):
    campaign_id: str
    nodes: list[RelationshipNode]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _verify_campaign_gm(
    campaign_id: str, user: User, db: AsyncSession
) -> Campaign:
    result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id, Campaign.gm_user_id == user.id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Must be GM of this campaign")
    return campaign


async def _verify_campaign_member(
    campaign_id: str, user: User, db: AsyncSession
) -> Campaign:
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
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


async def _get_npc(npc_id: str, db: AsyncSession) -> NPC:
    result = await db.execute(select(NPC).where(NPC.id == npc_id))
    npc = result.scalar_one_or_none()
    if not npc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NPC not found")
    return npc


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/campaign/{campaign_id}", response_model=list[NPCResponse])
async def list_npcs(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List NPCs in a campaign.
    GM sees all fields; players see only revealed NPCs with limited info.
    """
    campaign = await _verify_campaign_member(campaign_id, current_user, db)

    result = await db.execute(
        select(NPC).where(NPC.campaign_id == campaign_id)
    )
    npcs = result.scalars().all()

    # If user is not the GM, filter to only known NPCs and strip GM-only fields
    if campaign.gm_user_id != current_user.id:
        visible_npcs = []
        for npc in npcs:
            if npc.known_to_players:
                # Create a sanitized copy — hide secrets, knows, gm_notes
                visible_npcs.append(npc)
        return visible_npcs

    return npcs


@router.get("/{npc_id}", response_model=NPCResponse)
async def get_npc(
    npc_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get NPC detail."""
    npc = await _get_npc(npc_id, db)

    # If the NPC belongs to a campaign, verify membership
    if npc.campaign_id:
        campaign = await _verify_campaign_member(npc.campaign_id, current_user, db)
        # If player and NPC not revealed, hide it
        if campaign.gm_user_id != current_user.id and not npc.known_to_players:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NPC not found")

    return npc


@router.post("", response_model=NPCResponse, status_code=status.HTTP_201_CREATED)
async def create_npc(
    body: NPCCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create an NPC (GM only if campaign-scoped)."""
    if body.campaign_id:
        await _verify_campaign_gm(body.campaign_id, current_user, db)

    npc = NPC(**body.model_dump())
    db.add(npc)
    await db.commit()
    await db.refresh(npc)
    return npc


@router.put("/{npc_id}", response_model=NPCResponse)
async def update_npc(
    npc_id: str,
    body: NPCUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an NPC (GM only)."""
    npc = await _get_npc(npc_id, db)

    if npc.campaign_id:
        await _verify_campaign_gm(npc.campaign_id, current_user, db)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(npc, field, value)

    await db.commit()
    await db.refresh(npc)
    return npc


@router.delete("/{npc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_npc(
    npc_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove an NPC (GM only)."""
    npc = await _get_npc(npc_id, db)

    if npc.campaign_id:
        await _verify_campaign_gm(npc.campaign_id, current_user, db)

    await db.delete(npc)
    await db.commit()


@router.put("/{npc_id}/reveal", response_model=NPCResponse)
async def reveal_npc(
    npc_id: str,
    body: RevealNPCRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Make an NPC visible (or hidden) to players (GM only)."""
    npc = await _get_npc(npc_id, db)

    if npc.campaign_id:
        await _verify_campaign_gm(npc.campaign_id, current_user, db)

    npc.known_to_players = body.known_to_players
    if body.player_visible_info is not None:
        npc.player_visible_info = body.player_visible_info

    await db.commit()
    await db.refresh(npc)
    return npc


@router.get("/campaign/{campaign_id}/relationships", response_model=RelationshipMapResponse)
async def get_relationship_map(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get NPC relationship map data for visualization."""
    campaign = await _verify_campaign_member(campaign_id, current_user, db)

    result = await db.execute(
        select(NPC).where(NPC.campaign_id == campaign_id)
    )
    npcs = result.scalars().all()

    # For players, only show known NPCs
    if campaign.gm_user_id != current_user.id:
        npcs = [n for n in npcs if n.known_to_players]

    nodes = [
        RelationshipNode(
            npc_id=npc.id,
            name=npc.name,
            attitude_to_party=npc.attitude_to_party,
            relationships=npc.relationships,
        )
        for npc in npcs
    ]

    return RelationshipMapResponse(
        campaign_id=campaign_id,
        nodes=nodes,
    )

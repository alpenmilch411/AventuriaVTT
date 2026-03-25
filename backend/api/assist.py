"""AI Assist endpoints (GM-only) — stubbed for Claude API integration."""

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from database import get_db
from models.user import User
from models.campaign import Campaign
from models.session_state import GameSession, SessionLog

router = APIRouter(prefix="/api/assist", tags=["assist"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _verify_gm_of_campaign(
    campaign_id: str, user: User, db: AsyncSession
) -> Campaign:
    result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id, Campaign.gm_user_id == user.id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Must be GM of the campaign")
    return campaign


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class AIQueryRequest(BaseModel):
    campaign_id: str
    query: str
    context: Optional[dict] = None
    """
    context can include:
      - current_scene, active_npcs, party_state, recent_events, etc.
    """


class AIQueryResponse(BaseModel):
    query: str
    response: str
    suggestions: Optional[list[str]] = None
    metadata: Optional[dict] = None


class RecapRequest(BaseModel):
    session_id: str


class RecapResponse(BaseModel):
    session_id: str
    recap: str
    highlights: list[str]
    key_events: list[dict[str, Any]]


class NPCGenerateRequest(BaseModel):
    campaign_id: str
    constraints: Optional[dict] = None
    """
    constraints can include:
      - species, profession, gender, age_range, personality_hints,
        role_in_story, location, attitude_to_party
    """


class NPCGenerateResponse(BaseModel):
    name: str
    species: Optional[str] = None
    profession: Optional[str] = None
    personality_tags: list[str]
    voice_notes: Optional[str] = None
    appearance: Optional[str] = None
    background: Optional[str] = None
    knows: list[str]
    secrets: list[str]
    attitude_to_party: Optional[str] = None
    suggested_icon: Optional[str] = None


class MapGenerateRequest(BaseModel):
    campaign_id: str
    description: str
    map_type: Optional[str] = None  # "dungeon" | "wilderness" | "city" | "building"
    grid_size: Optional[dict] = None  # {"width": 20, "height": 20}


class MapGenerateResponse(BaseModel):
    map_name: str
    description: str
    grid_config: dict
    suggested_tokens: list[dict]
    suggested_triggers: list[dict]
    landmarks: list[dict]
    walls: list[list]


class ExtractRequest(BaseModel):
    campaign_id: str
    content_type: str  # "pdf" | "image" | "text"
    raw_text: Optional[str] = None


class ExtractResponse(BaseModel):
    status: str
    adventure_title: Optional[str] = None
    chapters: list[dict]
    scenes: list[dict]
    npcs: list[dict]
    items: list[dict]
    maps: list[dict]
    warnings: list[str]


# ---------------------------------------------------------------------------
# Endpoints — all stubbed for Claude API integration
# ---------------------------------------------------------------------------

@router.post("/query", response_model=AIQueryResponse)
async def ai_query(
    body: AIQueryRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Free-text AI query for GM assistance.
    Use cases: NPC dialog, rules clarification, improvisation help,
    encounter balancing, world-building suggestions.

    STUB: Will integrate with Claude API.
    """
    await _verify_gm_of_campaign(body.campaign_id, current_user, db)

    return AIQueryResponse(
        query=body.query,
        response=(
            "[AI Assist Stub] This endpoint will use the Claude API to provide "
            "context-aware GM assistance. Your query has been received but AI "
            "processing is not yet implemented."
        ),
        suggestions=[
            "Consider the party's current situation",
            "Think about NPC motivations",
            "Review relevant rules",
        ],
        metadata={"model": "claude", "status": "stub"},
    )


@router.post("/recap", response_model=RecapResponse)
async def generate_recap(
    body: RecapRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a session recap from the session log.

    STUB: Will use Claude API to analyze session logs and produce
    a narrative summary.
    """
    # Get session and verify GM
    session_result = await db.execute(select(GameSession).where(GameSession.id == body.session_id))
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    campaign_result = await db.execute(select(Campaign).where(Campaign.id == session.campaign_id))
    campaign = campaign_result.scalar_one_or_none()
    if not campaign or campaign.gm_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Must be GM")

    # Collect session logs for context
    logs_result = await db.execute(
        select(SessionLog)
        .where(SessionLog.session_id == body.session_id)
        .order_by(SessionLog.timestamp)
    )
    logs = logs_result.scalars().all()

    return RecapResponse(
        session_id=body.session_id,
        recap=(
            f"[AI Recap Stub] Session #{session.session_number} recap generation is not yet implemented. "
            f"Found {len(logs)} log entries to analyze."
        ),
        highlights=["Recap generation will be powered by Claude API"],
        key_events=[
            {"type": "stub", "description": "AI-generated key events will appear here"}
        ],
    )


@router.post("/npc-generate", response_model=NPCGenerateResponse)
async def generate_npc(
    body: NPCGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a random NPC with personality, background, and secrets.

    STUB: Will use Claude API with DSA5 lore context.
    """
    await _verify_gm_of_campaign(body.campaign_id, current_user, db)

    constraints = body.constraints or {}

    return NPCGenerateResponse(
        name=constraints.get("name_hint", "Alrik von Gareth"),
        species=constraints.get("species", "Mensch"),
        profession=constraints.get("profession", "Haendler"),
        personality_tags=["freundlich", "verschlagen", "neugierig"],
        voice_notes="[Stub] Speaks with a slight Garethi accent, tends to pause mid-sentence.",
        appearance="[Stub] A middle-aged man with a salt-and-pepper beard and keen eyes.",
        background="[Stub] AI-generated background will appear here.",
        knows=["[Stub] Local trade routes", "[Stub] Rumors about the old ruins"],
        secrets=["[Stub] Has a hidden cache of contraband"],
        attitude_to_party=constraints.get("attitude_to_party", "neutral"),
        suggested_icon="npc_merchant",
    )


@router.post("/map-generate", response_model=MapGenerateResponse)
async def generate_map(
    body: MapGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a map layout from a text description.

    STUB: Will use Claude API to produce map data (grid, walls, tokens, triggers).
    """
    await _verify_gm_of_campaign(body.campaign_id, current_user, db)

    grid = body.grid_size or {"width": 20, "height": 20}

    return MapGenerateResponse(
        map_name=f"Generated: {body.description[:50]}",
        description=f"[Stub] AI-generated map based on: {body.description}",
        grid_config={
            "type": "square",
            "width": grid["width"],
            "height": grid["height"],
            "cell_px": 40,
        },
        suggested_tokens=[
            {"name": "[Stub] Entry point", "position_x": 1.0, "position_y": 1.0, "entity_type": "landmark"},
        ],
        suggested_triggers=[
            {
                "name": "[Stub] Sample trigger",
                "position_x": 5.0,
                "position_y": 5.0,
                "trigger_type": "event",
                "description": "AI-generated trigger placeholder",
            },
        ],
        landmarks=[
            {"name": "[Stub] Main feature", "x": 10.0, "y": 10.0, "description": "Central landmark"},
        ],
        walls=[],
    )


@router.post("/extract", response_model=ExtractResponse)
async def extract_adventure(
    body: ExtractRequest,
    file: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Extract structured adventure data from uploaded content (PDF, photos, text).

    STUB: Will use Claude API with vision capabilities for PDFs/images
    and text extraction for raw text.
    """
    await _verify_gm_of_campaign(body.campaign_id, current_user, db)

    file_info = None
    if file:
        content = await file.read()
        file_info = {
            "filename": file.filename,
            "content_type": file.content_type,
            "size": len(content),
        }

    return ExtractResponse(
        status="stub",
        adventure_title="[Stub] Extracted Adventure Title",
        chapters=[
            {"title": "[Stub] Chapter 1", "summary": "AI extraction not yet implemented"}
        ],
        scenes=[
            {"title": "[Stub] Opening Scene", "read_aloud": "Placeholder text"}
        ],
        npcs=[
            {"name": "[Stub] Extracted NPC", "description": "Placeholder"}
        ],
        items=[],
        maps=[],
        warnings=[
            "AI extraction is not yet implemented. This is a stub response.",
            f"File info: {file_info}" if file_info else "No file uploaded",
        ],
    )

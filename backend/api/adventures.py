"""Adventure import, chapters, scenes, and campaign attachment endpoints."""

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from database import get_db
from models.user import User
from models.campaign import Campaign
from models.adventure import Adventure, Chapter, Scene

router = APIRouter(prefix="/api/adventures", tags=["adventures"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class AdventureCreate(BaseModel):
    title: str
    description: Optional[str] = None
    author: Optional[str] = None
    difficulty: Optional[str] = None
    player_count: Optional[str] = None
    estimated_duration: Optional[str] = None
    setting: Optional[str] = None
    tags: Optional[list] = None


class AdventureUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    author: Optional[str] = None
    difficulty: Optional[str] = None
    player_count: Optional[str] = None
    estimated_duration: Optional[str] = None
    setting: Optional[str] = None
    tags: Optional[list] = None


class ChapterCreate(BaseModel):
    title: str
    summary: Optional[str] = None
    chapter_goal: Optional[str] = None
    sort_order: int = 0


class ChapterResponse(BaseModel):
    id: str
    adventure_id: str
    title: str
    summary: Optional[str] = None
    chapter_goal: Optional[str] = None
    sort_order: int

    model_config = {"from_attributes": True}


class SceneCreate(BaseModel):
    title: str
    read_aloud: Optional[str] = None
    gm_notes: Optional[str] = None
    gm_secrets: Optional[dict] = None
    npcs: Optional[list] = None
    encounter_id: Optional[str] = None
    map_id: Optional[str] = None
    handouts: Optional[list] = None
    transitions: Optional[dict] = None
    triggers: Optional[list] = None
    mood: Optional[str] = None
    ambient_sound: Optional[str] = None
    time_advance: Optional[str] = None
    sort_order: int = 0


class SceneUpdate(BaseModel):
    title: Optional[str] = None
    read_aloud: Optional[str] = None
    gm_notes: Optional[str] = None
    gm_secrets: Optional[dict] = None
    npcs: Optional[list] = None
    encounter_id: Optional[str] = None
    map_id: Optional[str] = None
    handouts: Optional[list] = None
    transitions: Optional[dict] = None
    triggers: Optional[list] = None
    mood: Optional[str] = None
    ambient_sound: Optional[str] = None
    time_advance: Optional[str] = None
    status: Optional[str] = None
    notes_during_play: Optional[dict] = None
    sort_order: Optional[int] = None


class SceneResponse(BaseModel):
    id: str
    chapter_id: Optional[str] = None
    campaign_id: Optional[str] = None
    adventure_id: Optional[str] = None
    title: str
    read_aloud: Optional[str] = None
    gm_notes: Optional[str] = None
    gm_secrets: Optional[dict] = None
    npcs: Optional[list] = None
    encounter_id: Optional[str] = None
    map_id: Optional[str] = None
    handouts: Optional[list] = None
    transitions: Optional[dict] = None
    triggers: Optional[list] = None
    mood: Optional[str] = None
    ambient_sound: Optional[str] = None
    time_advance: Optional[str] = None
    status: str
    notes_during_play: Optional[dict] = None
    sort_order: int

    model_config = {"from_attributes": True}


class AdventureResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    author: Optional[str] = None
    difficulty: Optional[str] = None
    player_count: Optional[str] = None
    estimated_duration: Optional[str] = None
    setting: Optional[str] = None
    source: str
    tags: Optional[list] = None
    created_by: Optional[str] = None
    created_at: datetime
    chapters: list[ChapterResponse] = []
    scenes: list[SceneResponse] = []

    model_config = {"from_attributes": True}


class AdventureListResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    author: Optional[str] = None
    difficulty: Optional[str] = None
    source: str
    tags: Optional[list] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UseAdventureRequest(BaseModel):
    campaign_id: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_own_adventure(
    adventure_id: str, user: User, db: AsyncSession
) -> Adventure:
    result = await db.execute(
        select(Adventure).where(
            Adventure.id == adventure_id,
            Adventure.created_by == user.id,
        )
    )
    adventure = result.scalar_one_or_none()
    if not adventure:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Adventure not found")
    return adventure


# ---------------------------------------------------------------------------
# Adventure endpoints
# ---------------------------------------------------------------------------

@router.post("", response_model=AdventureResponse, status_code=status.HTTP_201_CREATED)
async def create_adventure(
    body: AdventureCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create an adventure manually."""
    adventure = Adventure(
        created_by=current_user.id,
        source="original",
        **body.model_dump(),
    )
    db.add(adventure)
    await db.commit()
    await db.refresh(adventure)
    return adventure


@router.get("", response_model=list[AdventureListResponse])
async def list_adventures(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List the current user's adventures."""
    result = await db.execute(
        select(Adventure)
        .where(Adventure.created_by == current_user.id)
        .order_by(Adventure.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{adventure_id}", response_model=AdventureResponse)
async def get_adventure(
    adventure_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get adventure with chapters and scenes."""
    result = await db.execute(select(Adventure).where(Adventure.id == adventure_id))
    adventure = result.scalar_one_or_none()
    if not adventure:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Adventure not found")
    return adventure


@router.put("/{adventure_id}", response_model=AdventureResponse)
async def update_adventure(
    adventure_id: str,
    body: AdventureUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update adventure metadata."""
    adventure = await _get_own_adventure(adventure_id, current_user, db)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(adventure, field, value)

    await db.commit()
    await db.refresh(adventure)
    return adventure


# ---------------------------------------------------------------------------
# Chapter endpoints
# ---------------------------------------------------------------------------

@router.post("/{adventure_id}/chapters", response_model=ChapterResponse, status_code=status.HTTP_201_CREATED)
async def add_chapter(
    adventure_id: str,
    body: ChapterCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a chapter to an adventure."""
    await _get_own_adventure(adventure_id, current_user, db)

    chapter = Chapter(adventure_id=adventure_id, **body.model_dump())
    db.add(chapter)
    await db.commit()
    await db.refresh(chapter)
    return chapter


# ---------------------------------------------------------------------------
# Scene endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/{adventure_id}/chapters/{chapter_id}/scenes",
    response_model=SceneResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_scene(
    adventure_id: str,
    chapter_id: str,
    body: SceneCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a scene to a chapter."""
    await _get_own_adventure(adventure_id, current_user, db)

    # Verify chapter belongs to adventure
    chapter_result = await db.execute(
        select(Chapter).where(
            Chapter.id == chapter_id,
            Chapter.adventure_id == adventure_id,
        )
    )
    if not chapter_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chapter not found")

    scene = Scene(
        chapter_id=chapter_id,
        adventure_id=adventure_id,
        **body.model_dump(),
    )
    db.add(scene)
    await db.commit()
    await db.refresh(scene)
    return scene


@router.put("/scenes/{scene_id}", response_model=SceneResponse)
async def update_scene(
    scene_id: str,
    body: SceneUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a scene."""
    result = await db.execute(select(Scene).where(Scene.id == scene_id))
    scene = result.scalar_one_or_none()
    if not scene:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scene not found")

    update_data = body.model_dump(exclude_unset=True)
    if "status" in update_data and update_data["status"] not in ("upcoming", "active", "completed"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="status must be upcoming, active, or completed",
        )

    for field, value in update_data.items():
        setattr(scene, field, value)

    await db.commit()
    await db.refresh(scene)
    return scene


# ---------------------------------------------------------------------------
# Use adventure (attach to campaign)
# ---------------------------------------------------------------------------

@router.post("/{adventure_id}/use", response_model=AdventureResponse)
async def use_adventure(
    adventure_id: str,
    body: UseAdventureRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Attach an adventure to a campaign (creates a copy).
    The GM links the adventure so scenes/chapters are available during play.
    """
    # Verify source adventure exists
    source_result = await db.execute(select(Adventure).where(Adventure.id == adventure_id))
    source = source_result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Adventure not found")

    # Verify campaign and GM
    campaign_result = await db.execute(
        select(Campaign).where(
            Campaign.id == body.campaign_id,
            Campaign.gm_user_id == current_user.id,
        )
    )
    campaign = campaign_result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not GM of this campaign")

    # Create a copy of the adventure for this campaign
    copy = Adventure(
        title=source.title,
        description=source.description,
        author=source.author,
        difficulty=source.difficulty,
        player_count=source.player_count,
        estimated_duration=source.estimated_duration,
        setting=source.setting,
        source="imported",
        tags=source.tags,
        created_by=current_user.id,
    )
    db.add(copy)
    await db.flush()

    # Copy chapters and scenes
    for chapter in source.chapters:
        new_chapter = Chapter(
            adventure_id=copy.id,
            title=chapter.title,
            summary=chapter.summary,
            chapter_goal=chapter.chapter_goal,
            sort_order=chapter.sort_order,
        )
        db.add(new_chapter)
        await db.flush()

        for scene in chapter.scenes:
            new_scene = Scene(
                chapter_id=new_chapter.id,
                adventure_id=copy.id,
                campaign_id=body.campaign_id,
                title=scene.title,
                read_aloud=scene.read_aloud,
                gm_notes=scene.gm_notes,
                gm_secrets=scene.gm_secrets,
                npcs=scene.npcs,
                encounter_id=scene.encounter_id,
                map_id=scene.map_id,
                handouts=scene.handouts,
                transitions=scene.transitions,
                triggers=scene.triggers,
                mood=scene.mood,
                ambient_sound=scene.ambient_sound,
                time_advance=scene.time_advance,
                sort_order=scene.sort_order,
            )
            db.add(new_scene)

    # Link the copy to the campaign
    campaign.adventure_id = copy.id

    await db.commit()
    await db.refresh(copy)
    return copy


# ---------------------------------------------------------------------------
# AI-assisted import (stub)
# ---------------------------------------------------------------------------

@router.post("/import", response_model=dict, status_code=status.HTTP_202_ACCEPTED)
async def import_adventure(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    AI-assisted adventure import from PDF or photos.
    This is a stub — the actual implementation will use the Claude API
    to extract structured adventure data from uploaded content.
    """
    filename = file.filename or "unknown"
    content_type = file.content_type or "application/octet-stream"
    file_size = 0

    # Read file to get size (but don't process yet)
    content = await file.read()
    file_size = len(content)

    return {
        "status": "accepted",
        "message": "Adventure import is being processed. This is a stub endpoint.",
        "filename": filename,
        "content_type": content_type,
        "file_size": file_size,
        "adventure_id": None,  # Will be populated when AI extraction completes
    }


# ---------------------------------------------------------------------------
# Campaign-scoped scene listing
# ---------------------------------------------------------------------------

@router.get("/campaigns/{campaign_id}/scenes")
async def list_scenes_for_campaign(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all scenes for a campaign (via adventure or directly attached)."""
    # Scenes directly on campaign
    result = await db.execute(
        select(Scene).where(Scene.campaign_id == campaign_id).order_by(Scene.sort_order)
    )
    scenes = list(result.scalars().all())

    # Also check if campaign has an adventure
    campaign_result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = campaign_result.scalar_one_or_none()
    if campaign and campaign.adventure_id:
        adv_scenes = await db.execute(
            select(Scene).where(Scene.adventure_id == campaign.adventure_id).order_by(Scene.sort_order)
        )
        for s in adv_scenes.scalars().all():
            if s.id not in {sc.id for sc in scenes}:
                scenes.append(s)

    return [
        {
            "id": s.id,
            "title": s.title,
            "read_aloud": s.read_aloud,
            "gm_notes": s.gm_notes,
            "gm_secrets": s.gm_secrets,
            "npcs": s.npcs,
            "encounter_id": s.encounter_id,
            "map_id": s.map_id,
            "handouts": s.handouts,
            "transitions": s.transitions,
            "triggers": s.triggers,
            "mood": s.mood,
            "ambient_sound": s.ambient_sound,
            "time_advance": s.time_advance,
            "status": s.status,
            "notes_during_play": s.notes_during_play,
            "content_list": s.content_list,
            "sort_order": s.sort_order,
            "chapter_id": s.chapter_id,
        }
        for s in scenes
    ]

"""Wiki API — public reference content endpoints."""

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.wiki import WikiPage
from models.databank import (
    CreatureTemplate,
    WeaponTemplate,
    ArmorTemplate,
    SpellTemplate,
    LiturgyTemplate,
    ItemTemplate,
    SpecialAbilityTemplate,
    TalentTemplate,
)

router = APIRouter(prefix="/api/wiki", tags=["wiki"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class WikiPageSummary(BaseModel):
    slug: str
    title: str
    category: str
    sort_order: int


class WikiPageDetail(BaseModel):
    slug: str
    title: str
    category: str
    sort_order: int
    content: str


class SearchResult(BaseModel):
    type: str
    slug: Optional[str] = None
    id: Optional[str] = None
    name: Optional[str] = None
    title: Optional[str] = None
    category: Optional[str] = None
    excerpt: str


class SearchResponse(BaseModel):
    results: list[SearchResult]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_excerpt(text: str, term: str, context_chars: int = 100) -> str:
    """Return ~context_chars around the first occurrence of term in text."""
    if not text:
        return ""
    lower_text = text.lower()
    lower_term = term.lower()
    idx = lower_text.find(lower_term)
    if idx == -1:
        return text[:context_chars] + ("..." if len(text) > context_chars else "")

    start = max(0, idx - context_chars // 2)
    end = min(len(text), idx + len(term) + context_chars // 2)
    excerpt = text[start:end]
    if start > 0:
        excerpt = "..." + excerpt
    if end < len(text):
        excerpt = excerpt + "..."
    return excerpt


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/pages", response_model=list[WikiPageSummary])
async def list_pages(
    category: Optional[str] = Query(None, description="Filter by category"),
    db: AsyncSession = Depends(get_db),
):
    """List all wiki pages (no content — just metadata for TOC)."""
    stmt = select(WikiPage)
    if category:
        stmt = stmt.where(WikiPage.category == category)
    stmt = stmt.order_by(WikiPage.category, WikiPage.sort_order, WikiPage.title)

    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        WikiPageSummary(
            slug=r.slug,
            title=r.title,
            category=r.category,
            sort_order=r.sort_order,
        )
        for r in rows
    ]


@router.get("/pages/{slug}", response_model=WikiPageDetail)
async def get_page(slug: str, db: AsyncSession = Depends(get_db)):
    """Get a single wiki page with full content."""
    result = await db.execute(select(WikiPage).where(WikiPage.slug == slug))
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Wiki page '{slug}' not found",
        )
    return WikiPageDetail(
        slug=page.slug,
        title=page.title,
        category=page.category,
        sort_order=page.sort_order,
        content=page.content,
    )


@router.get("/search", response_model=SearchResponse)
async def search_wiki(
    q: str = Query(..., min_length=1, description="Search term"),
    db: AsyncSession = Depends(get_db),
):
    """Search across wiki pages and databank tables."""
    pattern = f"%{q}%"
    results: list[SearchResult] = []

    # 1. Search wiki pages (title + content)
    wiki_result = await db.execute(
        select(WikiPage)
        .where(or_(WikiPage.title.ilike(pattern), WikiPage.content.ilike(pattern)))
        .limit(20)
    )
    for page in wiki_result.scalars().all():
        # Prefer excerpt from content if it matches, otherwise from title
        excerpt = _extract_excerpt(page.content, q)
        results.append(SearchResult(
            type="wiki",
            slug=page.slug,
            title=page.title,
            category=page.category,
            excerpt=excerpt,
        ))

    # 2. Search databank tables by name
    databank_searches: list[tuple[str, type]] = [
        ("creature", CreatureTemplate),
        ("weapon", WeaponTemplate),
        ("armor", ArmorTemplate),
        ("spell", SpellTemplate),
        ("liturgy", LiturgyTemplate),
        ("item", ItemTemplate),
        ("special_ability", SpecialAbilityTemplate),
        ("talent", TalentTemplate),
    ]

    for type_name, model in databank_searches:
        db_result = await db.execute(
            select(model).where(model.name.ilike(pattern)).limit(10)
        )
        for row in db_result.scalars().all():
            description = getattr(row, "description", None) or ""
            excerpt = _extract_excerpt(description, q) if description else row.name
            results.append(SearchResult(
                type=type_name,
                id=row.id,
                name=row.name,
                excerpt=excerpt,
            ))

    return SearchResponse(results=results)

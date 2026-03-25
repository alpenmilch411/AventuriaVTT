# Aventuria VTT

A browser-based GM toolkit for Das Schwarze Auge 5th Edition. Supports — but never replaces — the human Game Master. Players join from their phones, roll physical dice, and manage their characters. The GM runs the session from a cockpit. A shared screen shows the map and story. Everything syncs in real-time.

## What It Does

- **GM Cockpit** (laptop/tablet): scene flow, combat tracker, NPC registry, encounter builder, map editor, AI assist, soundboard
- **Player Dashboard** (phone): character sheet, inventory, spells, talents, dice input, quest log, personal journal
- **Table View** (TV/projector): maps, handouts, atmosphere images, initiative bar — a window into Aventurien
- **Persistence**: characters live across campaigns, lore books grow, NPCs remember, dead characters get memorials
- **AI Prep**: upload adventure PDFs → AI extracts scenes, NPCs, maps → GM reviews → ready to play

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TailwindCSS + Konva.js |
| Backend | Python 3.12 + FastAPI + WebSockets |
| Database | PostgreSQL + Redis |
| AI Assist | Claude API (Sonnet) |
| Hosting | Cloud-hosted (always-on for between-session access) |

## Local Development Setup

```bash
# Clone
git clone https://github.com/[TBD]/aventuria-vtt.git
cd aventuria-vtt

# Environment
cp .env.example .env
# Fill in: DATABASE_URL, REDIS_URL, ANTHROPIC_API_KEY, SECRET_KEY

# Infrastructure
docker-compose up -d  # PostgreSQL + Redis

# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev

# Seed databank
cd backend
python -m databank.seed
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `SECRET_KEY` | Yes | Auth token signing key |
| `ANTHROPIC_API_KEY` | Yes | Claude API for AI features |

## Repo Structure

```
aventuria-vtt/
├── SPEC.md              # Full technical specification (source of truth)
├── OVERVIEW.md          # Plain-language project overview
├── DEVLOG.md            # Development session log
├── GOTCHAS.md           # Known implementation traps
├── backend/             # FastAPI server + DSA5 rules engine + AI assist
│   ├── api/             # REST endpoints
│   ├── ws/              # WebSocket layer
│   ├── engine/          # DSA5 rules (pure functions)
│   ├── ai/              # Claude API integration
│   ├── models/          # SQLAlchemy / Pydantic models
│   ├── databank/        # Reference data modules
│   └── importers/       # Character/adventure importers
├── frontend/            # React app (GM Cockpit, Player Dashboard, Table View, Prep)
│   └── src/
│       ├── views/       # gm/, player/, table/, prep/
│       ├── components/  # Shared components
│       └── stores/      # State management
├── databank-seed/       # JSON seed data (creatures, weapons, spells, etc.)
└── adventures/          # Example adventure packages
```

## Docs

- [OVERVIEW.md](OVERVIEW.md) — What this project is and why
- [SPEC.md](SPEC.md) — Full technical specification (~4000 lines)
- [DEVLOG.md](DEVLOG.md) — Development history
- [GOTCHAS.md](GOTCHAS.md) — Known traps and workarounds

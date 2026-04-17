# Aventuria VTT

> ⚠️ **Highly work in progress + vibecoded.** Personal project, lots still to clean out. It works well enough for my own group's sessions, but expect sharp edges. Free for noncommercial use — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

A browser-based helper for running sessions of **Das Schwarze Auge 5th Edition** (*DSA5 / The Dark Eye*). Supports — never replaces — the human Game Master. Originally built to take the bookkeeping load off my group's GM so they could focus on the story.

Everyone opens the same web app in their browser. The GM goes to `/gm/<session-code>`, each player goes to `/play/<session-code>`. The layout adapts to whatever screen size you have — laptop, tablet, phone, same app. State syncs live over WebSocket.

See [OVERVIEW.md](OVERVIEW.md) for the plain-language pitch.

## What Works Today

- **Account + character management** — login, character creator with DSA5 rules, lifecycle states, character viewer, Optolith-compatible import
- **Session flow** — GM creates session, players join by code, real-time state sync, reconnection with gap detection + dead-letter replay
- **Full combat** — initiative, AT/PA/AW, damage, conditions with level rules, reactions + SchiP accounting, dual-wield, opposed probes, Manöver combinations, range brackets
- **Magic & spirituality** — spells and liturgies with correct costs/durations/properties, spell/liturgy enhancements
- **Inventory, shops, loot** — equipment rules, session-scoped shop system, GM loot distribution
- **Campaign fabric** — lore/NPC registry, quests, world clock, weather, group inventory
- **Databank** — 3,600+ DSA5 entities imported from Optolith (species, cultures, professions, advantages, disadvantages, special abilities, spells, liturgies, items, weapons, armor, ...)

## What's Rough

- Automated tests are sparse — a handful of Playwright E2E scripts, no pytest suite yet
- Mobile polish is uneven
- Dead code from earlier design pivots is still being trimmed

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TailwindCSS + Zustand + lucide-react |
| Backend | Python 3.12 + FastAPI + async SQLAlchemy + WebSockets |
| Database | SQLite (dev default — zero setup) / PostgreSQL (prod) |
| Optional | Redis (falls back to in-memory), Anthropic Claude API |

## Local Development

```bash
# Clone
git clone https://github.com/alpenmilch411/AventuriaVTT.git
cd AventuriaVTT

# Environment — SQLite mode needs no services running
cp .env.example .env
# Edit .env. At a minimum set SECRET_KEY to a non-default value.
# Generate one with: python -c 'import secrets; print(secrets.token_urlsafe(48))'

# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev

# Seed the reference databank (3,600+ DSA5 entities)
cd backend
python -m databank.seed

# Optional: also seed a demo GM + 4 players + campaign for local testing
python -m databank.seed --seed-test-users
# or set SEED_TEST_USERS=true in .env
```

Then open http://localhost:5173 in your browser.

### Test accounts (only if `--seed-test-users`)

| Role | Email | Password |
|---|---|---|
| GM | `gm@test.de` | `test1234` |
| Player 1–4 | `player{1,2,3,4}@test.de` | `test1234` |

A demo campaign "Der Turm des Orkschamanen" (code `ORKTURM-42`) is also created. **Never enable test users on a public deployment** — the credentials are published in this README.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | No | SQLite file | Async DB URL (sqlite+aiosqlite or postgresql+asyncpg) |
| `DATABASE_URL_SYNC` | No | SQLite file | Sync DB URL (used by seed script) |
| `SECRET_KEY` | **Yes for prod** | dev default | JWT signing key. Refuses to start if `ENV=production` and this is unset. |
| `ENV` | No | `development` | Set to `production` on public deployments |
| `REDIS_URL` | No | empty (in-memory) | Redis for pub/sub + caching; falls back to in-memory |
| `CORS_ORIGINS` | No | `http://localhost:5173` | Comma-separated allowed origins |
| `SEED_TEST_USERS` | No | `false` | Dev-only flag for the seed script |

See [.env.example](.env.example) for the full list with notes.

## Repo Structure

```
AventuriaVTT/
├── README.md             # This file
├── OVERVIEW.md           # Plain-language pitch
├── CLAUDE.md             # Rules for AI assistants working in this repo
├── SPEC.md               # Technical specification (source of truth)
├── ROADMAP.md            # Current milestone + backlog
├── DEVLOG.md             # Session-by-session history
├── GOTCHAS.md            # DSA5 + implementation traps
├── LICENSE               # PolyForm Noncommercial 1.0.0
├── NOTICE                # Fan-work disclaimer, DSA5 IP acknowledgment
├── .env.example          # Environment variable template
├── backend/              # Python 3.12 + FastAPI + async SQLAlchemy + WebSockets
│   ├── api/              # REST endpoints
│   ├── ws/               # WebSocket manager + handlers (bulk of game logic)
│   ├── engine/           # DSA5 rules (pure functions)
│   ├── models/           # SQLAlchemy + Pydantic models
│   ├── databank/         # seed.py loads databank-seed/ JSON → DB
│   └── importers/        # Optolith + DSA Ultimate JSON importers
├── frontend/             # React 18 + Vite + Tailwind + Zustand
│   └── src/
│       ├── engine/       # Mirrors backend DSA5 rules for computed values
│       ├── hooks/        # useCombatValues, useWebSocket, ...
│       ├── stores/       # Zustand slices (auth, session, combat, character, ...)
│       ├── components/   # GM Cockpit, Player Dashboard, wizards, databank
│       └── utils/safeData.js
├── databank-seed/        # JSON reference data (source for seed.py)
└── docs/                 # Superpowers specs + Codex audit outputs
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the fork + pull-request workflow, house rules, and the issue-claim process (so two people don't accidentally work on the same thing).

This repo also uses the kickstart / Superpowers workflow for AI-assisted changes (Claude Code, Codex) — see `CLAUDE.md` → Session Workflow. The `/context` and `/log` slash commands document useful conventions.

## License

Code: **PolyForm Noncommercial License 1.0.0** — see [LICENSE](LICENSE). You can use, modify, and redistribute for noncommercial purposes. Commercial use is not permitted.

Game content: *Das Schwarze Auge*, *Aventurien*, and DSA5 rules are intellectual property of Ulisses Spiele. This is an unofficial fan project — see [NOTICE](NOTICE). Buy the Grundregelwerk if you actually want to play.

# Drop Campaigns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Campaign / CampaignPlayer / Quest / LoreEntry / TimelineEvent / Group / GroupMember / GroupInventory end-to-end. Sessions become the only user-facing unit. Closes GH issue #1.

**Architecture:** Six ordered commits within a single PR. Each commit boots cleanly. Commit 3 must land before Commit 5 (handler references `GameSession.campaign_id`). Session-end loot persistence goes through existing WS `_handle_session_end` pattern (extended with a `loot` field + new `_persist_loot_awards`), not a new REST endpoint. Auth narrowings (stripping campaign-GM bypass blocks) leave owner-only + `TODO(#2/#3)` markers — a parallel session-scoped auth model is explicitly deferred to issues #2 and #3.

**Tech Stack:** Python 3.12, FastAPI, async SQLAlchemy, SQLite (dev) / Postgres (prod), React 18 + Zustand (frontend), WebSockets.

**Required reading before starting:** `docs/superpowers/specs/2026-04-17-drop-campaigns-design.md` (v5). This plan references spec sections by number — keep it open.

**Execution preference (from memory):** Opus for synthesis-heavy tasks (SessionEndPanel novel JSX, migration design, auth narrowing judgment). Sonnet 4.6 subagents for mechanical file work (pure deletions, import strips, test sweeps). Each task below annotates `[Opus inline]` or `[Sonnet subagent]`.

**Between-commit gate:** After every commit, dispatch Codex review on the diff via Bash (`node /Users/yannik/.claude/plugins/cache/openai-codex/codex/1.0.3/scripts/codex-companion.mjs task "Review commit <SHA> for..."`). Per CLAUDE.md Rule 1 this is a security-boundary change → uncapped rounds, continue until zero HIGH/MEDIUM findings. Each commit section ends with a "Codex review gate" step.

---

## Task 0: Pre-flight

**Files:** none.

- [ ] **Step 0.1: Verify clean working tree**

Run: `git status --short`
Expected: empty output (no uncommitted changes). Spec + retroactive DEVLOG were committed earlier (6a7c993, 2c72cf4).

- [ ] **Step 0.2: Create feature branch**

Run:
```bash
git checkout -b issue-1-drop-campaigns
```

- [ ] **Step 0.3: Read the spec**

Open `docs/superpowers/specs/2026-04-17-drop-campaigns-design.md` in full. Every implementation step below cites a section.

- [ ] **Step 0.4: Confirm issue #1 assigned**

Run: `gh issue view 1 --json assignees -q '.assignees[].login'`
Expected: `alpenmilch411` (or the user's handle) — claimed in the pre-brainstorm session.

---

## Task 1: WS loot persistence (additive) — Commit 1

**Files:**
- Modify: `backend/ws/handlers.py` (extend `_handle_session_end` at ~line 2061; add `_persist_loot_awards` near existing `_persist_ap_awards` at line 449)

**Execution:** [Sonnet subagent] — tight spec, ~70 lines of additions, one file.

- [ ] **Step 1.1: Add `_persist_loot_awards` function**

In `backend/ws/handlers.py`, immediately after `_persist_ap_awards` (ends ~line 508), add:

```python
async def _persist_loot_awards(session_code: str, loot: list):
    """Persist loot awards to character basis_inventory and broadcast inventory_change.

    loot: [{character_id, items: [{name, quantity, template_id?}]}, ...]

    Validates each row: skip non-dict rows, trim names, coerce quantity to
    positive int, log-and-skip malformed entries. Does not fail the batch
    on a single bad entry.
    """
    if not loot:
        return
    try:
        from database import async_session
        from sqlalchemy import select
        from models.character import Character
        from models.session_state import GameSession

        async with async_session() as db:
            sess_result = await db.execute(
                select(GameSession).where(GameSession.session_code == session_code)
            )
            session_obj = sess_result.scalar_one_or_none()
            if not session_obj:
                logger.error("Cannot persist loot — session not found for code %s", session_code)
                return

            for row in loot:
                if not isinstance(row, dict):
                    logger.warning("Loot row is not a dict, skipping: %r", row)
                    continue
                character_id = row.get("character_id")
                items_in = row.get("items") or []
                if not character_id or not isinstance(items_in, list):
                    logger.warning("Loot row missing character_id or items, skipping: %r", row)
                    continue

                # Normalize + validate each item
                clean_items = []
                for it in items_in:
                    if not isinstance(it, dict):
                        continue
                    name = (it.get("name") or "").strip()
                    try:
                        qty = int(it.get("quantity") or 0)
                    except (TypeError, ValueError):
                        qty = 0
                    if not name or qty <= 0:
                        continue
                    entry = {"name": name, "quantity": qty}
                    if it.get("template_id"):
                        entry["template_id"] = it["template_id"]
                    clean_items.append(entry)

                if not clean_items:
                    continue

                async with _get_char_lock(character_id):
                    char_result = await db.execute(
                        select(Character).where(Character.id == character_id)
                    )
                    char = char_result.scalar_one_or_none()
                    if not char:
                        logger.warning("Loot award skipped — character %s not found", character_id)
                        continue

                    # Normalize basis_inventory shape (dict-with-items vs. bare list)
                    raw_inv = char.basis_inventory or []
                    if isinstance(raw_inv, dict):
                        inv_items = list(raw_inv.get("items") or [])
                        inv_wrap = dict(raw_inv)
                    else:
                        inv_items = list(raw_inv)
                        inv_wrap = None

                    # Merge: stack quantity if same name (+ same template_id if present)
                    for new_item in clean_items:
                        matched = False
                        for existing in inv_items:
                            if not isinstance(existing, dict):
                                continue
                            if existing.get("name") != new_item["name"]:
                                continue
                            if new_item.get("template_id") and existing.get("template_id") != new_item["template_id"]:
                                continue
                            existing["quantity"] = (existing.get("quantity") or 0) + new_item["quantity"]
                            matched = True
                            break
                        if not matched:
                            inv_items.append(dict(new_item))

                    if inv_wrap is not None:
                        inv_wrap["items"] = inv_items
                        char.basis_inventory = inv_wrap
                    else:
                        char.basis_inventory = inv_items

                    await db.commit()

                    # Broadcast inventory_change so connected clients update live
                    msg = _msg(EventType.INVENTORY_CHANGE, {
                        "character_id": character_id,
                        "inventory": char.basis_inventory,
                    })
                    await manager.broadcast_to_room(session_code, msg)

                    logger.info(
                        "Loot persisted: %d items -> character %s",
                        len(clean_items), character_id,
                    )
    except Exception as e:
        logger.exception("Failed to persist loot for session %s: %s", session_code, e)
```

**Note:** Verify `EventType.INVENTORY_CHANGE` exists in `backend/ws/events.py`. If the handler doesn't currently have that event member, use the string `"inventory_change"` literally in `_msg(...)`. Check by:

Run: `grep -n "INVENTORY_CHANGE\|inventory_change" /Users/yannik/Projects/AventuriaVTT/backend/ws/events.py`

If `INVENTORY_CHANGE` is absent, replace `_msg(EventType.INVENTORY_CHANGE, ...)` with `_msg("inventory_change", ...)`.

- [ ] **Step 1.2: Extend `_handle_session_end` to schedule loot persistence**

In `backend/ws/handlers.py`, find `_handle_session_end` (~line 2061). It currently schedules `_persist_ap_awards` as a task. After that line, add a parallel task for loot. Example current code + addition:

```python
async def _handle_session_end(session_code: str, user_id: str, payload: dict, state: dict):
    """Broadcast session end and schedule cleanup."""
    awards = payload.get("awards") or []
    loot = payload.get("loot") or []  # NEW
    # ... existing msg construction + broadcast ...
    if awards:
        _safe_create_task(_persist_ap_awards(session_code, awards), name=f"persist_ap_{session_code}")
    if loot:  # NEW
        _safe_create_task(_persist_loot_awards(session_code, loot), name=f"persist_loot_{session_code}")
    # ... existing cleanup scheduling ...
```

Preserve all existing logic. Only add the `loot = payload.get(...)` pull + the new `_safe_create_task` branch. Line numbers will shift slightly as the function body grows.

- [ ] **Step 1.3: Boot check**

Run:
```bash
cd /Users/yannik/Projects/AventuriaVTT/backend
uvicorn main:app --port 8000 &
sleep 2
curl -s http://localhost:8000/docs | head -5
kill %1
```

Expected: HTML prefix shows the FastAPI Swagger UI loads. No Python import errors on startup.

- [ ] **Step 1.4: Manual WS smoke test (optional but recommended)**

With backend running and a seeded demo session (ORKTURM-42), connect as GM via websocat or browser. Send:

```json
{"type": "session_end", "payload": {"message": "test", "awards": [], "loot": [{"character_id": "<player1_char_id>", "items": [{"name": "Test Potion", "quantity": 1}]}]}}
```

Expected: player's `basis_inventory` gains `Test Potion x1`; connected clients receive `inventory_change` broadcast. If you skip this manual test, rely on the final PR-ready gate.

- [ ] **Step 1.5: Commit**

```bash
git add backend/ws/handlers.py
git commit -m "$(cat <<'EOF'
Add loot persistence to session_end WS handler (issue #1 prep)

New _persist_loot_awards mirrors _persist_ap_awards. Validates loot
payload (skip non-dict rows, trim names, coerce quantity, positive
int). Broadcasts inventory_change per affected character so connected
clients see items appear live before session cleanup.

Backward-compatible: payloads without a "loot" field are no-ops.

Prep for SessionEndPanel (Commit 2) which dispatches both awards +
loot in a single WS message.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 1.6: Codex review gate**

Dispatch Codex on this commit's diff:

```bash
node "/Users/yannik/.claude/plugins/cache/openai-codex/codex/1.0.3/scripts/codex-companion.mjs" task "Review commit $(git rev-parse HEAD) in /Users/yannik/Projects/AventuriaVTT. Focus on the new _persist_loot_awards function and _handle_session_end extension. Check: (a) inventory shape normalization correctness (dict-with-items vs bare list), (b) validation completeness (malformed payloads handled, no crash), (c) per-character lock usage, (d) inventory_change broadcast shape matches what frontend expects at useWebSocket.js:465-473, (e) any race with the existing session-end cleanup grace period (_SESSION_END_GRACE_SECONDS=30). Output HIGH/MEDIUM/LOW findings."
```

If HIGH or MEDIUM: fix inline, amend or add a follow-up commit, re-dispatch. Continue until clean.

---

## Task 2: Frontend rewire — Commit 2

**Files:**
- Create: `frontend/src/views/gm/SessionEndPanel.jsx`
- Modify: `frontend/src/stores/sessionStore.js` (add weather/worldClock/restResults)
- Modify: `frontend/src/hooks/useWebSocket.js` (~10 sites — delete scene/quest/lore, redirect to sessionStore)
- Modify: `frontend/src/hooks/useGMSession.js`, `frontend/src/hooks/useGMPopups.js`, `frontend/src/hooks/useGameState.js`
- Modify: `frontend/src/stores/authStore.js`, `frontend/src/stores/characterStore.js`
- Modify: `frontend/src/views/gm/GMCockpit.jsx`, `frontend/src/views/gm/SessionControls.jsx`
- Modify: `frontend/src/views/player/PlayerDashboard.jsx`, `frontend/src/views/player/InventoryPanel.jsx`
- Delete: `frontend/src/views/gm/GroupInventoryPanel.jsx`
- Delete: `frontend/src/views/gm/QuestSessionTab.jsx`
- Delete: `frontend/src/views/auth/CampaignManager.jsx`

**Execution:** [Opus inline] for `SessionEndPanel.jsx` (novel JSX, judgment-heavy). [Sonnet subagent] for mechanical site-swaps in `useWebSocket.js` + `InventoryPanel.jsx` + `PlayerDashboard.jsx`.

### 2a. Extend `sessionStore`

- [ ] **Step 2a.1: Add weather/worldClock/restResults to sessionStore**

In `frontend/src/stores/sessionStore.js`, add to the store's state + actions:

```js
// inside create((set) => ({ ... }))
// state:
weather: 'klar',
worldClock: { date: '1. Praios 1040 BF', time: '12:00', dayNight: 'day' },
restResults: null,

// actions:
setWeather: (weather) => set({ weather }),
setWorldClock: (clock) => set({ worldClock: clock }),
setRestResults: (results) => set({ restResults: results }),
```

Also extend `reset()` (if present) to clear these three to defaults.

### 2b. Create SessionEndPanel

- [ ] **Step 2b.1: Create `frontend/src/views/gm/SessionEndPanel.jsx`**

Full file content (240 lines, self-contained). Adapt Tailwind classes from existing `QuestSessionTab.jsx:190-440` visual style. Core logic:

```jsx
/**
 * SessionEndPanel — GM view for session-end AP + loot distribution.
 *
 * Dispatches a single WS `session_end` message carrying both awards and
 * loot payloads. Backend _handle_session_end schedules
 * _persist_ap_awards + _persist_loot_awards; broadcasts inventory_change
 * so connected clients see loot live.
 *
 * No REST calls.
 */
import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Award, AlertTriangle } from 'lucide-react'
import useSessionStore from '../../stores/sessionStore'
import clsx from 'clsx'

export default function SessionEndPanel({ sessionId, sendMessage, onClose }) {
  const players = useSessionStore((s) => s.players) || []

  // AP rewards: character_id -> { base, quest, bonus }
  const [apRewards, setApRewards] = useState({})
  // Loot rows: character_id -> Array<{ name, quantity }>
  // Starts EMPTY per character. + button adds a blank row.
  const [lootRows, setLootRows] = useState({})
  const [dispatched, setDispatched] = useState(false)

  // Initialize AP defaults + empty loot on first render
  useEffect(() => {
    if (players.length === 0) return
    const initialAP = {}
    const initialLoot = {}
    for (const p of players) {
      if (!p.characterId) continue
      initialAP[p.characterId] = { base: 10, quest: 0, bonus: 0 }
      initialLoot[p.characterId] = []
    }
    setApRewards(initialAP)
    setLootRows(initialLoot)
  }, [players.length])

  const addLootRow = (charId) => {
    setLootRows(prev => ({
      ...prev,
      [charId]: [...(prev[charId] || []), { name: '', quantity: 1 }],
    }))
  }

  const updateLootRow = (charId, idx, field, value) => {
    setLootRows(prev => ({
      ...prev,
      [charId]: prev[charId].map((r, i) => i === idx ? { ...r, [field]: value } : r),
    }))
  }

  const removeLootRow = (charId, idx) => {
    setLootRows(prev => ({
      ...prev,
      [charId]: prev[charId].filter((_, i) => i !== idx),
    }))
  }

  const setAP = (charId, field, val) => {
    setApRewards(prev => ({
      ...prev,
      [charId]: { ...prev[charId], [field]: parseInt(val) || 0 },
    }))
  }

  const totalAP = (charId) => {
    const ap = apRewards[charId]
    return ap ? (ap.base || 0) + (ap.quest || 0) + (ap.bonus || 0) : 0
  }

  const handleEndSession = () => {
    // Build awards array (amount > 0 only)
    const awards = Object.entries(apRewards)
      .map(([charId, ap]) => ({
        character_id: charId,
        amount: (ap.base || 0) + (ap.quest || 0) + (ap.bonus || 0),
        reason: `Session: ${ap.base} Basis + ${ap.quest} Quests + ${ap.bonus} Bonus`,
      }))
      .filter(a => a.amount > 0)

    // Build loot per character: filter empty names + zero qty, merge duplicates
    const loot = Object.entries(lootRows)
      .map(([charId, rows]) => {
        const cleaned = []
        for (const r of rows) {
          const name = (r.name || '').trim()
          const qty = parseInt(r.quantity) || 0
          if (!name || qty <= 0) continue
          // Merge duplicates (same name)
          const existing = cleaned.find(c => c.name === name)
          if (existing) {
            existing.quantity += qty
          } else {
            cleaned.push({ name, quantity: qty })
          }
        }
        return cleaned.length > 0 ? { character_id: charId, items: cleaned } : null
      })
      .filter(Boolean)

    sendMessage?.({
      type: 'session_end',
      payload: {
        message: 'Session beendet! Abenteuerpunkte wurden verteilt.',
        awards,
        loot,
      },
    })

    setDispatched(true)
  }

  if (dispatched) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <Award className="w-12 h-12 text-dsa-gold mb-4" />
        <h2 className="text-lg font-display font-bold text-dsa-gold mb-2">Session beendet</h2>
        <p className="text-sm text-dsa-parchment-dark mb-6 text-center">
          Abenteuerpunkte und Beute wurden verteilt.
        </p>
        <button onClick={onClose}
          className="px-4 py-2 text-xs bg-dsa-gold/20 border border-dsa-gold/40 text-dsa-gold rounded-sm hover:bg-dsa-gold/30 transition">
          Schliessen
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dsa-bg-medium bg-dsa-bg-card flex-shrink-0">
        <h2 className="text-sm font-display font-bold text-dsa-gold uppercase tracking-wider">
          Session beenden
        </h2>
        <button onClick={onClose} className="text-dsa-parchment-dark hover:text-dsa-parchment">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* AP rewards table */}
        <div>
          <h3 className="text-xs font-bold text-dsa-gold mb-2">Abenteuerpunkte</h3>
          <div className="bg-dsa-bg-card border border-dsa-bg-medium rounded-sm">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-dsa-bg-medium text-[10px] text-dsa-parchment-dark uppercase">
              <div className="col-span-3">Charakter</div>
              <div className="col-span-2 text-center">Basis</div>
              <div className="col-span-2 text-center">Quests</div>
              <div className="col-span-2 text-center">Bonus</div>
              <div className="col-span-3 text-center">Summe</div>
            </div>
            {players.filter(p => p.characterId).map(p => {
              const ap = apRewards[p.characterId] || { base: 10, quest: 0, bonus: 0 }
              return (
                <div key={p.characterId} className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-b border-dsa-bg-medium/30">
                  <div className="col-span-3">
                    <div className="text-xs text-dsa-parchment font-medium">{p.character?.name || p.username}</div>
                  </div>
                  <div className="col-span-2 text-center">
                    <input type="number" min="0" value={ap.base} onChange={e => setAP(p.characterId, 'base', e.target.value)}
                      className="w-14 text-center text-sm font-mono bg-dsa-bg border border-dsa-bg-medium rounded-sm px-1 py-0.5 text-dsa-parchment" />
                  </div>
                  <div className="col-span-2 text-center">
                    <input type="number" min="0" value={ap.quest} onChange={e => setAP(p.characterId, 'quest', e.target.value)}
                      className="w-14 text-center text-sm font-mono bg-dsa-bg border border-dsa-bg-medium rounded-sm px-1 py-0.5 text-dsa-parchment" />
                  </div>
                  <div className="col-span-2 text-center">
                    <input type="number" value={ap.bonus} onChange={e => setAP(p.characterId, 'bonus', e.target.value)}
                      className="w-14 text-center text-sm font-mono bg-dsa-bg border border-dsa-bg-medium rounded-sm px-1 py-0.5 text-dsa-parchment" />
                  </div>
                  <div className="col-span-3 text-center">
                    <span className="text-lg font-mono font-bold text-dsa-gold">{totalAP(p.characterId)}</span>
                    <span className="text-[9px] text-dsa-parchment-dark ml-1">AP</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Loot distribution */}
        <div>
          <h3 className="text-xs font-bold text-dsa-gold mb-2">Beute</h3>
          <div className="space-y-3">
            {players.filter(p => p.characterId).map(p => {
              const rows = lootRows[p.characterId] || []
              return (
                <div key={p.characterId} className="bg-dsa-bg-card border border-dsa-bg-medium rounded-sm p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-dsa-parchment font-medium">{p.character?.name || p.username}</div>
                    <button onClick={() => addLootRow(p.characterId)}
                      className="text-[10px] px-2 py-0.5 bg-dsa-gold/15 border border-dsa-gold/30 text-dsa-gold rounded-sm hover:bg-dsa-gold/25 transition flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Gegenstand
                    </button>
                  </div>
                  {rows.length === 0 ? (
                    <div className="text-[10px] text-dsa-parchment-dark/70 italic">Keine Beute.</div>
                  ) : (
                    <div className="space-y-1">
                      {rows.map((r, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input type="text" value={r.name} placeholder="Name..."
                            onChange={e => updateLootRow(p.characterId, idx, 'name', e.target.value)}
                            className="flex-1 text-xs bg-dsa-bg border border-dsa-bg-medium rounded-sm px-2 py-1 text-dsa-parchment" />
                          <input type="number" min="1" value={r.quantity}
                            onChange={e => updateLootRow(p.characterId, idx, 'quantity', parseInt(e.target.value) || 1)}
                            className="w-14 text-center text-xs font-mono bg-dsa-bg border border-dsa-bg-medium rounded-sm px-1 py-1 text-dsa-parchment" />
                          <button onClick={() => removeLootRow(p.characterId, idx)}
                            className="text-red-400 hover:text-red-300">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Warning */}
        <div className="bg-amber-900/15 border border-amber-800/25 rounded-sm p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-[10px] text-dsa-parchment-dark">
            <strong className="text-amber-400">Achtung:</strong> Nach dem Beenden werden die Abenteuerpunkte
            und Beute permanent auf die Charaktere gebucht. Die Session wird archiviert.
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-dsa-bg-medium flex justify-between items-center flex-shrink-0">
        <button onClick={onClose} className="px-4 py-2 text-xs text-dsa-parchment-dark border border-dsa-bg-medium rounded-sm hover:text-dsa-parchment transition">
          Abbrechen
        </button>
        <button onClick={handleEndSession}
          className="px-4 py-2 text-xs bg-red-900/30 border border-red-800/40 text-red-400 rounded-sm hover:bg-red-900/50 transition font-bold flex items-center gap-2">
          <Award className="w-4 h-4" /> Session beenden & Belohnungen verteilen
        </button>
      </div>
    </div>
  )
}
```

### 2c. Rewire hooks + stores

- [ ] **Step 2c.1: Redirect useWebSocket.js campaignStore sites to sessionStore**

In `frontend/src/hooks/useWebSocket.js`, the following sites need updating. Full mapping:

| Line (approx) | Current | New |
|---|---|---|
| 5 | `import useCampaignStore from '../stores/campaignStore'` | DELETE (no longer needed) |
| 67-76 | `scene_activate` dispatch block | DELETE |
| 296 | `useCampaignStore.getState().setWorldClock(...)` | `useSessionStore.getState().setWorldClock(...)` |
| 299 | `useCampaignStore.getState().setWeather(...)` | `useSessionStore.getState().setWeather(...)` |
| 304 | `useCampaignStore.getState().setRestResults(...)` | `useSessionStore.getState().setRestResults(...)` |
| 746-748 | `quest_update` → `handleCampaignMessage(msg)` | DELETE entire `else if (type === 'quest_update')` block |
| 751-758 | `lore_reveal` block with `addLoreEntry` | DELETE entire block |
| 776 | `if (payload.weather) useCampaignStore.getState().setWeather(...)` | `if (payload.weather) useSessionStore.getState().setWeather(...)` |
| 777 | `if (payload.in_game_time) useCampaignStore.getState().setWorldClock(...)` | `if (payload.in_game_time) useSessionStore.getState().setWorldClock(...)` |
| 778-782 | `if (payload.active_scene) ...` block | DELETE |
| 954 | catch-all `useCampaignStore.getState().handleCampaignMessage(msg)` | DELETE |

**Dispatch:** [Sonnet subagent] with this exact table. Prompt: "Apply the edits in the table above to `/Users/yannik/Projects/AventuriaVTT/frontend/src/hooks/useWebSocket.js`. Do not touch any other code in the file."

- [ ] **Step 2c.2: Strip useCampaignStore from other hooks + stores**

In each of these files, delete the `import useCampaignStore from '...'` line and any references to `useCampaignStore`:
- `frontend/src/hooks/useGMSession.js`
- `frontend/src/hooks/useGameState.js`
- `frontend/src/hooks/useGMPopups.js` (also delete `showGroupInventory`/`setShowGroupInventory` state if present; add `showSessionEnd`/`setShowSessionEnd` boolean state)
- `frontend/src/stores/authStore.js` (delete `useCampaignStore.reset()` call, typically in `logout()`)
- `frontend/src/stores/characterStore.js` (delete the `/api/campaigns/:id/characters` fetch path — find via grep)

**Dispatch:** [Sonnet subagent] with exact file list + instructions above.

- [ ] **Step 2c.3: Update GMCockpit, SessionControls, PlayerDashboard**

In `frontend/src/views/gm/GMCockpit.jsx`:
- Delete the `import GroupInventoryPanel from './GroupInventoryPanel'` line.
- Delete the `showGroupInventory`/`setShowGroupInventory` destructure and the button/modal that uses them (search for `GroupInventoryPanel`).
- Find the `showQuests` modal (imports `QuestSessionTab`, wrapping it). Rename `showQuests` → `showSessionEnd` and replace `<QuestSessionTab>` import+usage with `<SessionEndPanel sessionId={sessionId} sendMessage={sendMessage} onClose={() => setShowSessionEnd(false)} />`.
- Remove the `campaignId={useCampaignStore.getState().campaign?.id}` prop passing.

In `frontend/src/views/gm/SessionControls.jsx`:
- Replace `useCampaignStore((s) => s.weather)` → `useSessionStore((s) => s.weather)` (and `worldClock` likewise).

In `frontend/src/views/player/PlayerDashboard.jsx`:
- Delete `import useCampaignStore from '...'`.
- Replace any `useCampaignStore((s) => s.weather/worldClock)` selectors with `useSessionStore` equivalents.
- Remove the group-inventory mount block at ~line 403 (search for `GroupInventory` or `/api/inventory/group`).

**Dispatch:** [Opus inline] — GMCockpit rename is multi-step, judgment needed.

- [ ] **Step 2c.4: Strip player-side group-inventory block from InventoryPanel.jsx**

In `frontend/src/views/player/InventoryPanel.jsx`:
- Find the block near lines 299-400 that fetches `/api/inventory/group/:campaignId` — delete the `fetchGroupInventory` function, `groupItems` state, `moveGroupItem` function, and the render block (~line 1026+) for "Gruppeninventar".
- Drop the `campaignId` prop from the component signature if present.

**Dispatch:** [Sonnet subagent] with exact file path + description.

### 2d. Delete dead files

- [ ] **Step 2d.1: Delete three frontend files**

```bash
rm frontend/src/views/gm/GroupInventoryPanel.jsx
rm frontend/src/views/gm/QuestSessionTab.jsx
rm frontend/src/views/auth/CampaignManager.jsx
```

(Do NOT delete `frontend/src/stores/campaignStore.js` yet — happens in Commit 4. Keeping it now avoids broken imports if any Commit 2 edit missed a reference; we'll verify with `grep` in the final PR gate.)

### 2e. Boot check + commit

- [ ] **Step 2e.1: Verify build**

```bash
cd /Users/yannik/Projects/AventuriaVTT/frontend
npm run build
```

Expected: build succeeds with zero errors. Warnings about unused imports in `campaignStore.js` are acceptable (removed in Commit 4).

- [ ] **Step 2e.2: Dev-server smoke test**

```bash
cd /Users/yannik/Projects/AventuriaVTT/frontend
npm run dev &
sleep 3
# Verify nothing crashes on import at page load
curl -s http://localhost:5173 | head -20
kill %1
```

Expected: HTML response, no 5xx. If full verification is available (demo session running), load `/gm/ORKTURM-42`, end a session via new SessionEndPanel, confirm AP + loot payload appears in WS logs.

- [ ] **Step 2e.3: Commit**

```bash
git add -A frontend/
git commit -m "$(cat <<'EOF'
Frontend: rewire campaignStore state to sessionStore; SessionEndPanel (issue #1)

- sessionStore gains weather/worldClock/restResults (and setters); moved
  from campaignStore which is being deleted.
- SessionEndPanel.jsx (new, ~240 lines) replaces QuestSessionTab for the
  session-end flow: AP reward table + per-character loot rows with
  add/remove. Dispatches a single WS session_end message carrying both
  awards and loot; relies on backend _persist_loot_awards (Commit 1).
- Delete: GroupInventoryPanel.jsx (server endpoint being removed),
  QuestSessionTab.jsx (replaced), CampaignManager.jsx (dead file, no
  importers).
- useWebSocket.js: delete scene_activate / quest_update / lore_reveal
  dispatch branches; redirect weather_change / time_advance / rest_end /
  sync_full campaign fields to sessionStore.
- InventoryPanel.jsx: strip group-inventory block (endpoint being
  removed in Commit 4).
- PlayerDashboard.jsx: remove group-inventory mount.
- GMCockpit.jsx: swap QuestSessionTab modal for SessionEndPanel; drop
  GroupInventoryPanel button+modal.
- Hooks + stores strip useCampaignStore imports.

campaignStore.js file remains in the tree this commit; deleted in
Commit 4 after all backend imports go.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2e.4: Codex review gate**

```bash
node "/Users/yannik/.claude/plugins/cache/openai-codex/codex/1.0.3/scripts/codex-companion.mjs" task "Review commit $(git rev-parse HEAD) in /Users/yannik/Projects/AventuriaVTT. Focus: (a) SessionEndPanel.jsx correctness — does the loot UI state contract match spec §2.5.2 (zero initial rows, add-row appends blank, empty names/qty<=0 filtered pre-dispatch, duplicates merged client-side)? (b) WS message shape for session_end — matches backend _handle_session_end + _persist_loot_awards from Commit 1? (c) sessionStore additions — any missed consumers still reading from campaignStore? (d) InventoryPanel + PlayerDashboard — any group-inventory references left? (e) Any React hook rules violations in SessionEndPanel (e.g., conditional hooks). Output HIGH/MEDIUM/LOW."
```

Fix findings until zero HIGH/MEDIUM.

---

## Task 3: Backend WS handlers rip — Commit 3

**Files:**
- Modify: `backend/ws/handlers.py` (delete 3 handlers + state keys + sync_full fields + dispatch entries)
- Modify: `backend/ws/events.py` (drop 3 EventType members)
- Modify: `backend/models/session_state.py` (update `SessionLog.entry_type` comment)

**Execution:** [Sonnet subagent] — mechanical deletions, spec has exact line numbers.

**Critical dependency:** This commit MUST land before Commit 5. `_handle_scene_activate` at handlers.py:1298 reads `session_obj.campaign_id`. Deleting the handler now means Commit 5 can remove the column without a dangling field access.

- [ ] **Step 3.1: Delete three WS handlers**

In `backend/ws/handlers.py`, remove the following function definitions entirely (including docstrings):
- `_handle_scene_activate` at lines ~1285-1322 (~38 lines)
- `_handle_quest_update` at lines ~1950-1969 (~20 lines)
- `_handle_lore_reveal` at lines ~1972-1985 (~14 lines)

- [ ] **Step 3.2: Drop entries from dispatch table**

In `backend/ws/handlers.py`, find the dispatch table (`HANDLER_MAP` or similar) around line 755. Remove these entries:
- `EventType.SCENE_ACTIVATE: _handle_scene_activate,`
- `EventType.QUEST_UPDATE: _handle_quest_update,`
- `EventType.LORE_REVEAL: _handle_lore_reveal,`

- [ ] **Step 3.3: Strip state keys from `_ensure_state`**

In `backend/ws/handlers.py` `_ensure_state()` at line 201-226, remove these keys from the default state dict:

```python
# REMOVE:
"active_scene": None,
"tokens": [],
"quests": [],
"lore_entries": [],
```

Leave all other keys intact.

- [ ] **Step 3.4: Strip fields from SYNC_FULL payload**

In `backend/ws/handlers.py` at lines 3383-3402 (the `SYNC_FULL` message builder), remove these lines:

```python
# REMOVE:
"active_scene": state["active_scene"],
"tokens": state["tokens"],
"quests": state["quests"],
"lore_entries": state["lore_entries"],
```

- [ ] **Step 3.5: Drop three EventType members**

In `backend/ws/events.py`, remove:

```python
SCENE_ACTIVATE = "scene_activate"
QUEST_UPDATE = "quest_update"
LORE_REVEAL = "lore_reveal"
```

- [ ] **Step 3.6: Update SessionLog.entry_type comment**

In `backend/models/session_state.py` at line 246, change:

```python
# FROM:
)  # "combat" | "probe" | "scene" | "lore" | "quest" | "whisper" | "system"
# TO:
)  # "combat" | "probe" | "whisper" | "system"
```

- [ ] **Step 3.7: Boot check**

```bash
cd /Users/yannik/Projects/AventuriaVTT/backend
uvicorn main:app --port 8000 &
sleep 2
curl -s http://localhost:8000/docs > /dev/null && echo "OK"
kill %1
```

Expected: `OK`. No Python import errors.

- [ ] **Step 3.8: Grep cleanup verification**

```bash
grep -rn "_handle_scene_activate\|_handle_quest_update\|_handle_lore_reveal" backend/
grep -rn "SCENE_ACTIVATE\|QUEST_UPDATE\|LORE_REVEAL" backend/
grep -rn 'state\["active_scene"\]\|state\["tokens"\]\|state\["quests"\]\|state\["lore_entries"\]' backend/
```

Expected: zero matches for each.

- [ ] **Step 3.9: Commit**

```bash
git add backend/ws/handlers.py backend/ws/events.py backend/models/session_state.py
git commit -m "$(cat <<'EOF'
Backend WS: rip scene/quest/lore handlers + state (issue #1)

Deletes _handle_scene_activate, _handle_quest_update, _handle_lore_reveal
and their dispatch table entries + EventType members. Also strips
active_scene/tokens/quests/lore_entries from _ensure_state default state
and from the SYNC_FULL payload builder.

Updates SessionLog.entry_type comment to drop "scene"|"lore"|"quest"
(comment-only — no enum / DB enforcement).

Must land before the models+migration commit because
_handle_scene_activate read session_obj.campaign_id; deleting it now
unblocks the column drop.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3.10: Codex review gate**

```bash
node "/Users/yannik/.claude/plugins/cache/openai-codex/codex/1.0.3/scripts/codex-companion.mjs" task "Review commit $(git rev-parse HEAD) in /Users/yannik/Projects/AventuriaVTT. Verify: (a) all three WS handlers are fully deleted (no stragglers in dispatch table / event enum / state dict / sync_full), (b) no stale imports referencing deleted symbols, (c) SessionLog.entry_type comment is updated consistently with actual usage. Output HIGH/MEDIUM/LOW."
```

Fix until zero HIGH/MEDIUM.

---

## Task 4: Backend REST rip + auth narrowings — Commit 4

**Files:**
- Delete: `backend/api/campaigns.py`
- Delete: `frontend/src/stores/campaignStore.js`
- Modify: `backend/api/__init__.py`
- Modify: `backend/api/inventory.py` (delete group endpoints; narrow `_verify_character_access` + `execute_exchange`; Pydantic schema strip; get_inventory dict strip)
- Modify: `backend/api/characters.py` (narrow 3 endpoints)
- Modify: `backend/api/sessions.py` (Pydantic schema strip; complete_session block strip; response builder strips)
- Modify: `backend/ws/handlers.py` (self-exchange guard on `_execute_exchange`)

**Execution:** [Opus inline] for narrowings (judgment). [Sonnet subagent] for pure deletions.

### 4a. REST campaigns + group inventory deletion

- [ ] **Step 4a.1: Delete `backend/api/campaigns.py`**

```bash
rm backend/api/campaigns.py
```

- [ ] **Step 4a.2: Strip campaigns router from `api/__init__.py`**

In `backend/api/__init__.py`, remove:

```python
from api.campaigns import router as campaigns_router
# and in the list of included routers:
campaigns_router,
```

- [ ] **Step 4a.3: Delete group-inventory endpoints in `api/inventory.py`**

In `backend/api/inventory.py`:
- Delete the `GroupInventoryResponse` Pydantic class (~lines 72-80).
- Delete `get_group_inventory` function + `@router.get("/group/{campaign_id}")` decorator (~lines 380-430).
- Delete `move_group_item` function + `@router.post("/group/{campaign_id}/move")` decorator (~lines 433-560).
- Remove `MoveGroupItemRequest` Pydantic class if it's only used by `move_group_item`.

### 4b. Pydantic schema + response-builder cleanup

- [ ] **Step 4b.1: Strip `campaign_id` from `InventoryItemResponse`**

In `backend/api/inventory.py` at lines 25-36, remove the line:

```python
campaign_id: Optional[str] = None
```

- [ ] **Step 4b.2: Strip `campaign_id` from `get_inventory` item dict**

In `backend/api/inventory.py` at line 179, remove the line:

```python
"campaign_id": it.campaign_id,
```

- [ ] **Step 4b.3: Strip `campaign_id` from `SessionResponse` Pydantic schema**

In `backend/api/sessions.py` at line 163, remove the line:

```python
campaign_id: Optional[str] = None
```

- [ ] **Step 4b.4: Strip `campaign_id` from all `SessionResponse(...)` call sites**

In `backend/api/sessions.py`, grep for `campaign_id=session.campaign_id` and remove each occurrence. Expected sites (verify exact): 259, 383, 454, 629, 738, 776.

Run: `grep -n "campaign_id=session.campaign_id" backend/api/sessions.py`
Delete every matching line.

- [ ] **Step 4b.5: Strip CampaignPlayer snapshot block in `complete_session`**

In `backend/api/sessions.py` `complete_session()`, remove:
- Line 547: `from models.campaign import CampaignPlayer`
- Lines 586-604 (the entire `if session.campaign_id:` block that updates `CampaignPlayer.campaign_snapshot`).

Preserve everything else in the function — the `completion_snapshot` builder stays, the `char.locked_session_id = None` line stays.

### 4c. Auth narrowings (Opus judgment)

**For each of the following endpoints, the pattern is:**
1. Remove `from models.campaign import Campaign, CampaignPlayer` (inside the function).
2. Delete the campaign-GM bypass block (CampaignPlayer query + Campaign lookup + `gm_user_id` check).
3. Keep the owner check.
4. Add a TODO marker: `# TODO(#2/#3): GM mid-session auth via SessionPlayer membership`.

- [ ] **Step 4c.1: Narrow `PATCH /api/characters/:id/vitals`**

In `backend/api/characters.py` at line 842, the current bypass block runs roughly lines 866-885 (verify by grep). Replace that block with:

```python
# Owner-only authorization. TODO(#2/#3): GM mid-session auth via SessionPlayer membership.
if char.user_id != current_user.id:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
```

Keep everything after the auth check (the actual vitals update logic).

- [ ] **Step 4c.2: Narrow `PATCH /api/characters/:id/conditions`**

In `backend/api/characters.py` at line 904, the bypass block is ~918-935. Same pattern — replace with owner-only check + TODO comment.

- [ ] **Step 4c.3: Narrow `POST /api/characters/:id/death`**

In `backend/api/characters.py` at line 1080, the bypass block is ~1097-1110. Same pattern.

- [ ] **Step 4c.4: Narrow `_verify_character_access` in `api/inventory.py`**

In `backend/api/inventory.py` at line 118, the current function looks up CampaignPlayer and checks campaign.gm_user_id. Replace the function body with:

```python
async def _verify_character_access(
    character_id: str, user: User, db: AsyncSession
) -> Character:
    """Load the character and verify the caller owns it.

    TODO(#2/#3): GM mid-session auth via SessionPlayer membership.
    Campaign-GM bypass removed 2026-04-17 (issue #1).
    """
    char_result = await db.execute(
        select(Character).where(Character.id == character_id)
    )
    char = char_result.scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")
    if char.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    return char
```

Also remove the `from models.campaign import Campaign, CampaignPlayer` import at the top of the file (line 15) if no other function still uses it.

- [ ] **Step 4c.5: Narrow `execute_exchange` (both-sides-owned + self-exchange rejection)**

In `backend/api/inventory.py` `execute_exchange()` at line 635:

Replace lines 658-669 (the CampaignPlayer/Campaign query + `is_gm` flag + final 403 check) with:

```python
# Self-exchange rejection
if body.from_character_id == body.to_character_id:
    raise HTTPException(status_code=400, detail="Cannot exchange with self")

# Both-sides-owned narrowing. TODO(#2/#3): session-scoped GM auth for cross-owner trades.
if from_char.user_id != current_user.id or to_char.user_id != current_user.id:
    raise HTTPException(
        status_code=403,
        detail="Exchange requires ownership of both characters; cross-owner trades use the WS trade flow.",
    )
```

**Important ordering:** the self-exchange check comes AFTER loading both characters (so the 400 fires regardless of ownership) but BEFORE any mutation logic. Verify nothing between lines 635 and 690 mutates state before the auth check.

### 4d. WS self-exchange guard (mirror)

- [ ] **Step 4d.1: Add self-exchange guard to WS `_execute_exchange`**

In `backend/ws/handlers.py` at line 2556, find `_execute_exchange`. After the `from_char_id` / `to_char_id` extraction (~line 2563-2564) but before the `async with async_session() as db:` block, add:

```python
if from_char_id == to_char_id:
    await manager.send_to_user(gm_user_id, _error("Cannot exchange with self"))
    return
```

Do NOT add ownership checks in the WS handler — issue #3 handles that.

### 4e. Delete campaignStore.js

- [ ] **Step 4e.1: Delete `frontend/src/stores/campaignStore.js`**

```bash
rm frontend/src/stores/campaignStore.js
```

### 4f. Boot check + commit

- [ ] **Step 4f.1: Verify no stale imports**

```bash
grep -rn "from models.campaign\|from api.campaigns\|campaignStore" backend/ frontend/src/ 2>&1 | grep -v "backend/models/campaign.py" | grep -v "backend/databank/seed.py"
```

Expected: zero matches (aside from `backend/models/campaign.py` and `backend/databank/seed.py` which are cleaned in Commit 5).

- [ ] **Step 4f.2: Boot check**

```bash
cd /Users/yannik/Projects/AventuriaVTT/backend
uvicorn main:app --port 8000 &
sleep 2
curl -s http://localhost:8000/openapi.json | python3 -c "import json, sys; data=json.load(sys.stdin); paths=list(data['paths'].keys()); assert not any('/api/campaigns' in p for p in paths), 'campaigns endpoints still present'; assert not any('/api/inventory/group' in p for p in paths), 'group inventory endpoints still present'; print('OK: campaign + group-inventory routes absent')"
kill %1
```

Expected: `OK: campaign + group-inventory routes absent`.

- [ ] **Step 4f.3: Frontend build**

```bash
cd /Users/yannik/Projects/AventuriaVTT/frontend
npm run build
```

Expected: clean build.

- [ ] **Step 4f.4: Commit**

```bash
git add -A backend/ frontend/
git commit -m "$(cat <<'EOF'
Backend REST rip + auth narrowings (issue #1)

- Delete backend/api/campaigns.py + its router registration.
- Delete group-inventory endpoints (get/move) + GroupInventoryResponse.
- Strip campaign_id from SessionResponse and InventoryItemResponse
  Pydantic schemas; remove from all SessionResponse call sites.
- Strip the CampaignPlayer.campaign_snapshot write block from
  complete_session (character changes are already "live" on Character
  rows; campaign_snapshot was redundant bookkeeping that dies with
  Campaign).
- Narrow auth: remove campaign-GM bypass blocks from
    - PATCH /api/characters/:id/vitals
    - PATCH /api/characters/:id/conditions
    - POST  /api/characters/:id/death
    - _verify_character_access() gating ~7 inventory endpoints
    - POST /api/inventory/execute-exchange (now both-sides-owned +
      self-exchange rejection; cross-owner trades use WS trade flow)
  Each site leaves owner-only + TODO(#2/#3). Parallel session-scoped
  auth is explicitly deferred to issues #2 (WS handshake auth) + #3
  (character-ownership WS checks).
- Add self-exchange guard to WS _execute_exchange.
- Delete frontend/src/stores/campaignStore.js (no remaining imports).

Pre-existing frontend callers to narrowed endpoints are owner-only
(e.g. useWebSocket.js:635 is player-on-own-character). ProbeSetupPopup
already hits a nonexistent route (pre-existing dead code). E2E scripts
break — handled in Commit 6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4f.5: Codex review gate**

```bash
node "/Users/yannik/.claude/plugins/cache/openai-codex/codex/1.0.3/scripts/codex-companion.mjs" task "Review commit $(git rev-parse HEAD) in /Users/yannik/Projects/AventuriaVTT. Focus: (a) the five narrowed endpoints — is the owner check placed before any DB mutation? is the early 403 return correct? (b) execute_exchange self-exchange guard — does it come BEFORE state mutation but after character load? (c) _verify_character_access new body — does it still raise 404 when character is missing vs. 403 when owner check fails (correct semantics)? (d) any call sites that still try 'is_gm' / GM-of-campaign logic? (e) Pydantic schema changes consistent across all response builders? Output HIGH/MEDIUM/LOW."
```

Fix until zero HIGH/MEDIUM.

---

## Task 5: Models + migration + seed — Commit 5

**Files:**
- Delete: `backend/models/campaign.py`
- Modify: `backend/models/__init__.py`, `backend/models/user.py`, `backend/models/character.py`
- Modify: `backend/models/session_state.py` (drop `campaign_id` field + relationship)
- Modify: `backend/models/inventory.py` (drop `campaign_id` + relationship; delete `GroupInventory` class)
- Modify: `backend/database.py` (add `_migrate_drop_campaign_tables` + `_sqlite_table_rebuild_drop_col`)
- Modify: `backend/databank/seed.py` (replace `_create_test_campaign` with `_create_test_session`)

**Execution:** [Opus inline] — migration is subtle (SQLite rebuild, defer_foreign_keys semantics, Table.to_metadata).

### 5a. Drop model fields + relationships

- [ ] **Step 5a.1: Remove campaign imports + relationships from User**

In `backend/models/user.py`, find and delete:
- `gm_campaigns: Mapped[...]` relationship declaration.
- `campaign_players: Mapped[...]` relationship declaration.
- `created_groups: Mapped[...]` relationship declaration.
- `group_memberships: Mapped[...]` relationship declaration.

Grep first: `grep -n "gm_campaigns\|campaign_players\|created_groups\|group_memberships" backend/models/user.py`

- [ ] **Step 5a.2: Remove campaign_players relationship from Character**

In `backend/models/character.py`, delete:

```python
campaign_players: Mapped[list["CampaignPlayer"]] = relationship(...)
```

- [ ] **Step 5a.3: Remove campaign_id field + relationship from GameSession**

In `backend/models/session_state.py`, delete:

```python
campaign_id: Mapped[Optional[str]] = mapped_column(
    String(36), ForeignKey("campaigns.id", ondelete="CASCADE"),
    nullable=True, index=True,
)
# and
campaign: Mapped[Optional["Campaign"]] = relationship(
    "Campaign", back_populates="sessions"
)
```

- [ ] **Step 5a.4: Remove campaign_id field + relationship from InventoryItem; delete GroupInventory class**

In `backend/models/inventory.py`:
- Delete `InventoryItem.campaign_id` field declaration (~lines 27-30).
- Delete `InventoryItem.campaign` relationship declaration (~lines 46-49).
- Delete the entire `GroupInventory` class (~lines 63-84).

- [ ] **Step 5a.5: Update models/__init__.py**

In `backend/models/__init__.py`:
- Delete the campaign-module import block:
  ```python
  from models.campaign import (
      Group, GroupMember, Campaign, CampaignPlayer, Quest, LoreEntry, TimelineEvent,
  )
  ```
- Delete the 7 campaign entries from `__all__`: `"Group"`, `"GroupMember"`, `"Campaign"`, `"CampaignPlayer"`, `"Quest"`, `"LoreEntry"`, `"TimelineEvent"`.
- Also delete `"GroupInventory"` from `__all__` + the import at line 35.

- [ ] **Step 5a.6: Delete `backend/models/campaign.py`**

```bash
rm backend/models/campaign.py
```

### 5b. Migration function

- [ ] **Step 5b.1: Add `_migrate_drop_campaign_tables` + helper to `database.py`**

In `backend/database.py`, after the existing `_migrate_*` functions (before `init_db`), add:

```python
def _migrate_drop_campaign_tables(connection):
    """Drop Campaign/Group/Quest/Lore/Timeline tables and FK columns.

    Two-phase, FK-safe, idempotent.

    Phase 1: drop campaign_id columns on game_sessions and inventory_items.
      SQLite: table-rebuild via SQLAlchemy reflection of post-rip models.
      Postgres: ALTER TABLE ... DROP COLUMN CASCADE.
    Phase 2: drop campaign tables in FK-child-first order.

    Safe on fresh DB (nothing to drop). Idempotent.
    """
    from sqlalchemy import text, inspect
    from models.session_state import GameSession
    from models.inventory import InventoryItem

    insp = inspect(connection)
    existing_tables = set(insp.get_table_names())
    dialect = connection.engine.dialect.name  # "sqlite" | "postgresql"

    # Phase 1: drop campaign_id columns
    if dialect == "sqlite":
        # defer_foreign_keys=ON works inside open transactions (foreign_keys does not)
        connection.execute(text("PRAGMA defer_foreign_keys=ON"))

        for table_name, model_cls in [
            ("game_sessions", GameSession),
            ("inventory_items", InventoryItem),
        ]:
            if table_name not in existing_tables:
                continue
            cols = {c["name"] for c in insp.get_columns(table_name)}
            if "campaign_id" not in cols:
                continue
            _sqlite_table_rebuild_drop_col(connection, table_name, model_cls, "campaign_id")
    else:  # postgresql
        for table_name in ("game_sessions", "inventory_items"):
            if table_name not in existing_tables:
                continue
            cols = {c["name"] for c in insp.get_columns(table_name)}
            if "campaign_id" in cols:
                connection.execute(text(
                    f"ALTER TABLE {table_name} DROP COLUMN campaign_id CASCADE"
                ))

    # Phase 2: drop campaign tables in FK-child-first order
    drop_order = [
        "group_inventories", "campaign_players", "quests", "lore_entries",
        "timeline_events", "campaigns", "group_members", "groups",
    ]
    for tbl in drop_order:
        if tbl in existing_tables:
            connection.execute(text(f"DROP TABLE IF EXISTS {tbl}"))


def _sqlite_table_rebuild_drop_col(connection, old_table, model_cls, drop_col):
    """Rebuild a SQLite table without one column, using SQLAlchemy reflection
    of the current (post-rip) model's metadata to construct the new schema.

    Requires defer_foreign_keys=ON on the current transaction. Uses
    Table.to_metadata() to produce a properly-named temp Table object;
    no SQL string surgery.
    """
    from sqlalchemy import text, inspect, MetaData
    from sqlalchemy.schema import CreateTable, CreateIndex

    insp = inspect(connection)
    existing_cols = [c["name"] for c in insp.get_columns(old_table)]
    keep_cols = [c for c in existing_cols if c != drop_col]
    col_list_sql = ", ".join(keep_cols)

    tmp_name = f"{old_table}__rebuild"
    tmp_metadata = MetaData()
    tmp_table = model_cls.__table__.to_metadata(tmp_metadata, name=tmp_name)

    connection.execute(CreateTable(tmp_table))
    connection.execute(text(
        f"INSERT INTO {tmp_name} ({col_list_sql}) SELECT {col_list_sql} FROM {old_table}"
    ))
    connection.execute(text(f"DROP TABLE {old_table}"))
    connection.execute(text(f"ALTER TABLE {tmp_name} RENAME TO {old_table}"))

    # Recreate indexes declared on the original model (now resolved against
    # the renamed table by name).
    for idx in model_cls.__table__.indexes:
        try:
            connection.execute(CreateIndex(idx))
        except Exception:
            # Index may already exist if reused from the old table definition
            pass
```

- [ ] **Step 5b.2: Wire migration into `init_db()`**

In `backend/database.py` `init_db()`, after the last existing `await conn.run_sync(_migrate_*)` call, add:

```python
await conn.run_sync(_migrate_drop_campaign_tables)
```

Note: the existing migrations only run for SQLite (`if "sqlite" in settings.DATABASE_URL`). The new migration handles both dialects internally via `connection.engine.dialect.name`, so it should run unconditionally. Place the call AFTER the `if "sqlite" in ...` block, outside it, at the same indentation as the outer `await conn.run_sync(Base.metadata.create_all)`.

Actually re-reading `backend/database.py` — if all existing migrations are inside the SQLite-only block and the new migration handles both, put the new call outside the conditional. Verify structure before committing.

### 5c. Seed rewrite

- [ ] **Step 5c.1: Delete campaign imports from seed.py**

In `backend/databank/seed.py` at line 53:

```python
# DELETE:
from models.campaign import Campaign, CampaignPlayer, Group, GroupMember  # noqa: E402
```

- [ ] **Step 5c.2: Replace `_create_test_campaign` with `_create_test_session`**

In `backend/databank/seed.py`, find `_create_test_campaign` at line ~590. Replace the entire function with:

```python
def _create_test_session(session: Session, user_ids: Dict[str, str]):
    """Create a demo GameSession with 4 players pre-joined (lobby status)."""
    from models.session_state import GameSession, SessionPlayer
    from uuid import uuid4

    existing = session.query(GameSession).filter_by(session_code="ORKTURM-42").first()
    if existing:
        log.info("  Test session already exists: ORKTURM-42")
        return

    gm_user_id = user_ids.get("gm@test.de")
    if not gm_user_id:
        log.warning("  No gm@test.de user — skipping test session")
        return

    session_id = str(uuid4())
    game_session = GameSession(
        id=session_id,
        name="Der Turm des Orkschamanen",
        gm_user_id=gm_user_id,
        session_code="ORKTURM-42",
        status="lobby",
    )
    session.add(game_session)

    for email in ["player1@test.de", "player2@test.de", "player3@test.de", "player4@test.de"]:
        user_id = user_ids.get(email)
        if not user_id:
            continue
        char = session.query(Character).filter_by(user_id=user_id).first()
        session.add(SessionPlayer(
            id=str(uuid4()),
            session_id=session_id,
            user_id=user_id,
            character_id=char.id if char else None,
            status="active",
        ))

    log.info("  Created session: Der Turm des Orkschamanen (Code: ORKTURM-42, status=lobby)")
```

- [ ] **Step 5c.3: Update callsite**

In `backend/databank/seed.py` at line ~784, change:

```python
# FROM:
_create_test_campaign(session, user_ids)
# TO:
_create_test_session(session, user_ids)
```

- [ ] **Step 5c.4: Update log line at ~863**

```python
# FROM:
log.info("  Campaign: 'Der Turm des Orkschamanen' (Code: ORKTURM-42)")
# TO:
log.info("  Session: 'Der Turm des Orkschamanen' (Code: ORKTURM-42, status=lobby)")
```

- [ ] **Step 5c.5: Remove Group/GroupMember seed code**

In `backend/databank/seed.py`, delete any remaining code that constructs `Group(...)` or `GroupMember(...)`. Grep to find:

Run: `grep -n "Group(\|GroupMember(" backend/databank/seed.py`

Expected: zero matches after cleanup.

### 5d. Boot check + commit

- [ ] **Step 5d.1: Fresh-DB boot**

```bash
cd /Users/yannik/Projects/AventuriaVTT/backend
rm -f aventuria_vtt.db aventuria_vtt.db-shm aventuria_vtt.db-wal
python -c "import asyncio; from database import init_db; asyncio.run(init_db())"
```

Expected: no errors.

- [ ] **Step 5d.2: Verify schema**

```bash
sqlite3 backend/aventuria_vtt.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%campaign%' OR name LIKE '%quest%' OR name LIKE '%lore%' OR name LIKE '%timeline%' OR name LIKE '%group%'"
sqlite3 backend/aventuria_vtt.db "PRAGMA table_info(game_sessions)" | grep campaign_id
sqlite3 backend/aventuria_vtt.db "PRAGMA table_info(inventory_items)" | grep campaign_id
```

Expected: all three queries return empty.

- [ ] **Step 5d.3: Seed test users**

```bash
cd /Users/yannik/Projects/AventuriaVTT/backend
SEED_TEST_USERS=1 python -m databank.seed --seed-test-users
```

Expected: log shows "Created session: Der Turm des Orkschamanen (Code: ORKTURM-42, status=lobby)" and creates 4 SessionPlayer rows.

Verify:
```bash
sqlite3 backend/aventuria_vtt.db "SELECT session_code, status FROM game_sessions"
sqlite3 backend/aventuria_vtt.db "SELECT COUNT(*) FROM session_players"
```

Expected: 1 session (ORKTURM-42, lobby), 4 session_players.

- [ ] **Step 5d.4: Existing-DB migration check**

Back up the clean fresh-DB state:
```bash
cp backend/aventuria_vtt.db backend/aventuria_vtt.db.test_fresh
```

Now simulate an "existing DB with campaign tables" by checking out an earlier commit (pre-this-branch), booting, then re-applying this commit's code. Actually simpler: manually inject a campaign row:

```bash
# Can't easily add a campaign post-rip since the model is gone.
# The idempotency check is "run init_db twice on same DB, no errors."
python -c "import asyncio; from database import init_db; asyncio.run(init_db())"
```

Expected: second run succeeds with no errors (migration is idempotent).

- [ ] **Step 5d.5: Backend boot**

```bash
uvicorn main:app --port 8000 &
sleep 2
curl -s http://localhost:8000/docs > /dev/null && echo "OK"
kill %1
```

Expected: `OK`.

- [ ] **Step 5d.6: Commit**

```bash
git add -A backend/
git commit -m "$(cat <<'EOF'
Delete campaign models + FK columns; migration + seed rewrite (issue #1)

- Delete backend/models/campaign.py (Campaign, CampaignPlayer, Quest,
  LoreEntry, TimelineEvent, Group, GroupMember).
- Delete GroupInventory class from models/inventory.py.
- Drop campaign_id field + relationship from GameSession and
  InventoryItem.
- Drop gm_campaigns/campaign_players/created_groups/group_memberships
  from User; campaign_players from Character.
- Update models/__init__.py to match.

- Add _migrate_drop_campaign_tables + _sqlite_table_rebuild_drop_col to
  database.py. Dialect-branched: SQLite uses PRAGMA defer_foreign_keys=ON
  + Table.to_metadata()-based rebuild (no SQL string surgery); Postgres
  uses ALTER TABLE DROP COLUMN CASCADE. FK-child-first drop order.
  Idempotent.

- Replace _create_test_campaign with _create_test_session in seed.py.
  SEED_TEST_USERS=1 now creates 5 users + 5 characters + 1 demo
  GameSession (ORKTURM-42, lobby) + 4 SessionPlayer rows.

Verified: fresh DB boots clean; existing DB re-boot is a no-op;
sqlite3 .tables shows no campaign/quest/lore/group tables;
PRAGMA table_info confirms campaign_id columns gone.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5d.7: Codex review gate**

```bash
node "/Users/yannik/.claude/plugins/cache/openai-codex/codex/1.0.3/scripts/codex-companion.mjs" task "Review commit $(git rev-parse HEAD) in /Users/yannik/Projects/AventuriaVTT. This commit deletes models/campaign.py, removes campaign_id from GameSession+InventoryItem, and adds _migrate_drop_campaign_tables. Check: (a) migration correctness — does defer_foreign_keys=ON actually work inside the transaction engine.begin() opens? (b) Table.to_metadata() producing a proper CREATE TABLE for SQLite? (c) index reinstatement via CreateIndex — do indexes declared in __table_args__ carry over? (d) FK cascade behavior during drop order (all children dropped before parents)? (e) idempotency — re-running init_db on already-migrated DB doesn't error? (f) seed _create_test_session correct? (g) any stale model imports still around (api/, ws/, databank/)? Output HIGH/MEDIUM/LOW."
```

Fix until zero HIGH/MEDIUM.

---

## Task 6: E2E tests + docs — Commit 6

**Files:**
- Audit/migrate/delete: 6 frontend E2E `.mjs` test files
- Modify: `SPEC.md` (tombstones + strips)
- Modify: `CLAUDE.md`, `GOTCHAS.md`, `README.md`, `ROADMAP.md`, `DEVLOG.md`

**Execution:** [Sonnet subagent] for E2E test file audit. [Opus inline] for doc changes.

### 6a. E2E test audit

- [ ] **Step 6a.1: Audit each flagged E2E file**

For each of: `test-battle-full.mjs`, `test-e2e-battle.mjs`, `test-equip-rules.mjs`, `test-full-session.mjs`, `test-integration-sim.mjs`, `test-playwright-session.mjs`:

**Dispatch [Sonnet subagent]:** "Audit `/Users/yannik/Projects/AventuriaVTT/frontend/test-<NAME>.mjs`. Find every occurrence of `/api/campaigns/`, `/api/inventory/group/`, `PATCH /api/characters/.*/vitals`, `PATCH /api/characters/.*/conditions`, `POST /api/characters/.*/death`, or hardcoded campaign codes. Report: (a) is this test actively maintained (has it been touched in the last 90 days? does it reference current features?), (b) what does it do conceptually, (c) recommendation: migrate to WS-based flow, delete as aspirational scaffolding, or keep as-is if unaffected."

Collect the 6 reports. Decide per-file based on reports:
- Actively useful + broken → migrate (probably Opus judgment on this one).
- Aspirational scaffolding, never CI-run → delete.
- Unaffected by this milestone → leave.

- [ ] **Step 6a.2: Apply E2E decisions**

Based on the audit reports, either delete or migrate each file. Migrations likely involve swapping `fetch /api/campaigns/:id/*` for session-based equivalents or removing the test entirely.

- [ ] **Step 6a.3: Verify remaining E2E tests still load**

For any E2E file NOT deleted:
```bash
cd frontend
node --check test-<name>.mjs
```

Expected: no syntax errors.

### 6b. SPEC updates

- [ ] **Step 6b.1: Quick Reference — drop campaigns bullet**

In `SPEC.md` Quick Reference section, delete the line:
```
- **Campaigns are internal only** — the user-facing unit is Sessions. ...
```

- [ ] **Step 6b.2: Tombstone §5.5.4 (Group Inventory)**

Replace the §5.5.4 body with:
```
### 5.5.4 Group Inventory

Removed 2026-04-17 (issue #1). Group-shared loot is handled GM-side through character inventory transfers.
```

- [ ] **Step 6b.3: Strip §6 Data Models of Campaign/Quest/Lore/Timeline/Group blocks**

Find and remove any code blocks / prose describing `Campaign`, `CampaignPlayer`, `Quest`, `LoreEntry`, `TimelineEvent`, `Group`, `GroupMember`, `GroupInventory`. Update surviving `Session`, `Character`, `InventoryItem` blocks to drop `campaign_id` mentions.

- [ ] **Step 6b.4: Strip §7 scenes/quests/lore entity descriptions**

Wherever §7 treats scenes, quests, or lore as first-class entities, either tombstone or remove. Scene-activation flow goes. Quest-type / lore-category enums go.

- [ ] **Step 6b.5: Strip §8 WebSocket event table**

Remove rows for `scene_activate`, `scene_update`, `quest_update`, `lore_reveal`. Add a row for `session_end` payload update noting the new `loot` field.

- [ ] **Step 6b.6: Tombstone §10.12 (Campaign Achievements)**

Replace body with: "Removed 2026-04-17 (issue #1). Campaign concept is gone."

- [ ] **Step 6b.7: Update §10.2 Weather/Time framing**

Change "per campaign" language to "per session." The features themselves survive — time/weather are session-scoped now via sessionStore.

- [ ] **Step 6b.8: Add §11 historical note**

At the top of §11 (Phase archive), prepend:

> **Historical note (2026-04-17):** Entries below reference campaigns/scenes/quests/lore, which were removed in issue #1. Historical only — do not re-implement without a new ROADMAP item.

### 6c. Other doc updates

- [ ] **Step 6c.1: CLAUDE.md**

Delete the "Inventory scoping: Always read from Kampagnen-Inventar during sessions, never Basis-Inventar directly." bullet from Key Conventions.

- [ ] **Step 6c.2: GOTCHAS.md**

Find the "Character inventory: snapshot vs base confusion" entry. The Kampagnen-Inventar vs Basis-Inventar distinction no longer exists. Either delete the entry or rewrite to note the campaign scope is gone and `basis_inventory` is now the single source.

- [ ] **Step 6c.3: README.md sweep**

```bash
grep -n -i "campaign" README.md
```

Review each hit; update or remove as appropriate.

- [ ] **Step 6c.4: ROADMAP.md — move to Completed Milestones**

Remove the "Drop campaigns: sessions become the only user-facing unit" row from the P1 backlog table. Add a corresponding entry to the "Completed Milestones" section matching the Session 18/17 entry format.

- [ ] **Step 6c.5: DEVLOG.md — prepend Session 19 entry**

Prepend a Session 19 entry documenting this PR. Follow the format of Sessions 17/18. Include: commits, behavior changes, auth regressions accepted, known issues (#2/#3 will fix).

### 6d. Docs verification + commit

- [ ] **Step 6d.1: Grep verification**

```bash
grep -ri "campaign" SPEC.md CLAUDE.md GOTCHAS.md README.md | head -20
```

Expected: only historical references in §11 or intentional mentions. No active-feature references.

- [ ] **Step 6d.2: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Docs + E2E sweep: finalize Drop Campaigns milestone (issue #1)

- SPEC.md: Quick Reference drops campaigns bullet; §5.5.4, §10.12
  tombstoned; §6/§7 campaign/quest/lore blocks removed; §8 WS event
  table strips scene/quest/lore; §10.2 reframed as session-scoped;
  §11 gets historical note.
- CLAUDE.md: drop Kampagnen-Inventar bullet.
- GOTCHAS.md: rewrite / remove snapshot-vs-base entry.
- README.md: sweep for campaign mentions.
- ROADMAP.md: move "Drop campaigns" from P1 to Completed Milestones.
- DEVLOG.md: prepend Session 19 entry.
- Frontend E2E tests: per-file audit + migrate-or-delete (see diff).

Closes #1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6d.3: Codex review gate (final)**

```bash
node "/Users/yannik/.claude/plugins/cache/openai-codex/codex/1.0.3/scripts/codex-companion.mjs" task "Final review of branch issue-1-drop-campaigns against main in /Users/yannik/Projects/AventuriaVTT. Walk through the full diff (git diff main...HEAD). Check: (a) all six commits still boot cleanly if someone bisects, (b) no stale references to any of the 8 deleted tables, (c) no stale references to removed handlers/endpoints/components, (d) doc changes consistent with code changes (SPEC doesn't claim campaigns exist, CLAUDE.md doesn't reference Kampagnen-Inventar, etc.), (e) final auth posture clear — owner-only + TODO(#2/#3) markers everywhere they should be. Output HIGH/MEDIUM/LOW."
```

Fix until zero HIGH/MEDIUM.

---

## PR-Ready Verification Gate

After Task 6's Codex gate is green, run the full PR-ready verification from spec §6 before opening the PR.

- [ ] **Gate 1: Fresh-DB end-to-end**

```bash
cd /Users/yannik/Projects/AventuriaVTT/backend
rm -f aventuria_vtt.db*
SEED_TEST_USERS=1 python -m databank.seed --seed-test-users
uvicorn main:app --port 8000 &
BACKEND_PID=$!
sleep 3
```

Then separately:
```bash
cd /Users/yannik/Projects/AventuriaVTT/frontend
npm run build  # must succeed
npm run dev &
FRONTEND_PID=$!
sleep 3
```

- [ ] **Gate 2: Manual demo session walk-through**

1. Open two browsers. In browser 1: login as `gm@test.de` → dashboard → ORKTURM-42 → `/gm/ORKTURM-42`.
2. In browser 2: login as `player1@test.de` → `/play/ORKTURM-42`.
3. GM changes weather (e.g. "regnerisch"). Player sees update.
4. GM advances time. Player sees update.
5. GM starts combat. Attack flows work.
6. GM opens SessionEndPanel. Award 10 AP + "Heiltrank x2" + "Seil x1" to player 1. Confirm.
7. Player 1: verify `basis_inventory` shows new items within 1-2 seconds of GM confirmation (live `inventory_change` broadcast).
8. Check DB:
   ```bash
   sqlite3 backend/aventuria_vtt.db "SELECT character_id, amount FROM ap_awards"
   sqlite3 backend/aventuria_vtt.db "SELECT id, basis_inventory FROM characters WHERE user_id=(SELECT id FROM users WHERE email='player1@test.de')" | head -5
   ```

- [ ] **Gate 3: Schema cleanliness**

```bash
sqlite3 backend/aventuria_vtt.db ".tables" | tr ' ' '\n' | grep -E 'campaign|quest|lore|timeline|group_member|group_inventor' || echo "CLEAN"
sqlite3 backend/aventuria_vtt.db "PRAGMA table_info(game_sessions)" | grep campaign_id || echo "CLEAN"
sqlite3 backend/aventuria_vtt.db "PRAGMA table_info(inventory_items)" | grep campaign_id || echo "CLEAN"
```

Expected: `CLEAN` three times.

- [ ] **Gate 4: Auth posture**

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login -H "Content-Type: application/json" -d '{"email":"player2@test.de","password":"test1234"}' | python3 -c "import json, sys; print(json.load(sys.stdin)['access_token'])")
# Player 2 tries to mutate player 1's character vitals
PLAYER1_CHAR_ID=$(sqlite3 backend/aventuria_vtt.db "SELECT id FROM characters WHERE user_id=(SELECT id FROM users WHERE email='player1@test.de') LIMIT 1")
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH http://localhost:8000/api/characters/$PLAYER1_CHAR_ID/vitals \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"lep": 1}'
```

Expected: `403`.

- [ ] **Gate 5: Kill dev servers**

```bash
kill $BACKEND_PID $FRONTEND_PID
```

- [ ] **Gate 6: Docs grep**

```bash
grep -rn -i "campaign" SPEC.md CLAUDE.md GOTCHAS.md README.md ROADMAP.md 2>/dev/null | grep -v "^.*#.*historical\|2026-04-17"
```

Expected: either empty or only intentional mentions (historical / changelog).

- [ ] **Gate 7: GH issue close + PR open**

```bash
# Push branch
git push -u origin issue-1-drop-campaigns

# Open PR
gh pr create --title "Drop Campaigns: Sessions become the only user-facing unit (#1)" --body "$(cat <<'EOF'
## Summary
- Remove Campaign/CampaignPlayer/Quest/LoreEntry/TimelineEvent/Group/GroupMember/GroupInventory end-to-end.
- Sessions become the only user-facing unit.
- New `SessionEndPanel` + WS `_persist_loot_awards` replace phantom REST session-end flow.
- Migration drops 8 tables + 2 FK columns (dialect-branched: SQLite rebuild / Postgres CASCADE).
- Auth narrowings: campaign-GM bypass blocks stripped; owner-only + TODO(#2/#3) markers.

See `docs/superpowers/specs/2026-04-17-drop-campaigns-design.md` for the full design rationale (5 Codex review rounds).

## Test plan
- [ ] Fresh DB: `rm aventuria_vtt.db && python -m databank.seed --seed-test-users` → boots clean
- [ ] Backend: `uvicorn main:app` → clean startup, no campaign routes in OpenAPI
- [ ] Frontend: `npm run build` → clean
- [ ] Demo session walk-through: GM + player, weather/time, combat, SessionEndPanel awards AP + loot, player sees items live
- [ ] Schema: no `campaign*`/`quest*`/`lore*`/`timeline*`/`group*` tables; no `campaign_id` columns
- [ ] Auth: player cannot PATCH another player's character vitals via REST (403)
- [ ] Docs: no active-feature references to campaigns

Closes #1.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Gate 8: Final Codex pass on PR diff**

```bash
PR_URL=$(gh pr view --json url -q .url)
node "/Users/yannik/.claude/plugins/cache/openai-codex/codex/1.0.3/scripts/codex-companion.mjs" task "Final holistic review of PR $PR_URL (branch issue-1-drop-campaigns vs main) in /Users/yannik/Projects/AventuriaVTT. This is the last gate before merge. Output HIGH/MEDIUM/LOW findings only on the full diff."
```

If clean (zero HIGH/MEDIUM): ready to merge.

- [ ] **Gate 9: Close issue + merge**

After merge (admin-bypass or reviewer approval):
```bash
gh issue close 1 --comment "Closed in PR $PR_URL. Sessions are now the only user-facing unit. See DEVLOG Session 19."
```

---

## Appendix: Dispatch-ready subagent prompts

For [Sonnet subagent] tasks above, use the Agent tool with `model: "sonnet"`. Example prompt template:

```
Task: <crisp one-line summary>
File(s): <exact paths>
Exact changes: <bullet list or table from plan>
Verification: <grep command or boot check>
Do NOT: touch any other code in the file; extend the scope; add new features.
Report back: summary of what was done + any unexpected findings.
```

For [Opus inline] tasks, execute directly in the main thread — no dispatch.

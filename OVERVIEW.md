# Aventuria VTT — Overview

> ⚠️ **Highly work in progress.** This is a vibecoded personal project. A lot of code still needs to be cleaned out, design isn't settled, and things break. Use at your own risk.

## What it is

A browser-based helper for running sessions of *Das Schwarze Auge* 5th Edition (DSA5 / *The Dark Eye*). Not a replacement for the GM — the GM is still the creative authority. This is just bookkeeping infrastructure so the GM can think about the story instead of flipping pages.

Everyone in the group opens the same web app in their browser. The GM signs in and goes to `/gm/<session-code>` to run the session. Each player signs in and goes to `/play/<session-code>` to see their character sheet and take actions. The layout adapts to whatever screen size you have — laptop, tablet, phone, it's the same app. There's no separate "shared screen" or "player-phone" or "GM cockpit" client; the role is just a URL you open.

Real-time sync happens over WebSocket. When the GM calls a probe, rolls damage, or advances time, every connected player sees the update. When a player equips a weapon or drinks a potion, the GM sees it.

## Why this exists

I'm new to DSA5 and the group I play in has a GM who deserved better bookkeeping support than flipping through a 400-page rulebook mid-scene. So I built this, mostly for us. It turns out lots of DSA5 mechanics (condition stacking, opposed probes, Manöver combinations, SchiP spends, spell-duration accounting) are annoyingly fiddly to track by hand, which makes them a great fit for the app to handle.

If you also play DSA5 and find this useful, great — it's free for noncommercial use. Contributions welcome. Commercial use is not permitted (see `LICENSE`).

## What works today

- Account login, character management, character creator with DSA5 rules
- GM session creation, player join-by-code
- Full combat: initiative, AT/PA/AW, damage, conditions, reactions, SchiP, opposed probes, dual-wield, range brackets
- Spells + liturgies with correct costs/durations/properties
- Inventory, equipment rules, shop system, loot distribution
- Campaign lore, NPC registry, quests, world clock, weather
- Real-time state sync with reconnection / gap detection / dead-letter replay
- Reference databank with 3,600+ entities imported from Optolith

## What's rough

- Very little automated testing — mostly a few Playwright scripts
- AI features (PDF import, NPC dialog, session recap) are wired in config but not end-to-end
- The map / fog-of-war / token visualization is partial
- Mobile layouts work but aren't polished
- A bunch of dead code still hiding from earlier pivots

## Docs pointers

- `CLAUDE.md` — project rules + session workflow (for Claude Code contributors)
- `SPEC.md` — technical specification (architecture, data models, conventions). Long file; it has a Quick Reference at the top.
- `ROADMAP.md` — current milestone + backlog
- `GOTCHAS.md` — DSA5 implementation traps
- `DEVLOG.md` — session-by-session history
- `README.md` — setup + how to run locally

## Legal

This is a fan project. *Das Schwarze Auge*, *Aventurien*, and the DSA5 rules belong to Ulisses Spiele. See `NOTICE` for details. If you want to play DSA5 seriously, buy the Grundregelwerk — the authors deserve it.

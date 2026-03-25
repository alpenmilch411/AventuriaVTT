# Aventuria VTT — GOTCHAS

Known implementation traps, API quirks, and non-obvious behaviors. Claude MUST read this at session start and append new entries immediately when discovered.

*(Newest first)*

---

## DSA5: Multiple reactions require Schicksalspunkte
Only Helden and NSCs that have Schicksalspunkte (SchiP) can attempt more than one reaction (Parade/Ausweichen) per Kampfrunde. Regular creatures without SchiP get exactly one. The cumulative penalty is -3 per additional reaction (2nd at -3, 3rd at -6, etc.).
Affected: `engine/combat.py`
Found: 2026-03-22

## DSA5: Condition stacking from magic vs physical sources
Multiple magical effects causing the same condition do NOT stack — only the highest takes effect. Physical sources (damage, environment, alcohol) DO stack with each other and with magical conditions. E.g., Schmerz 2 from wounds + Corpofesso giving Schmerz 3 from magic → total Schmerz 3 (magic doesn't add to physical). But Schmerz 2 from wounds + Schmerz 1 from another wound → Schmerz 3 (physical stacks).
Affected: `engine/conditions.py`
Found: 2026-03-22

## DSA5: Handlungsunfähig at 8 total condition levels
A character becomes Handlungsunfähig not only when any single condition reaches Stufe IV, but also when the SUM of all condition levels reaches 8 or more (even if no individual condition is at IV). Easy to miss this rule.
Affected: `engine/conditions.py`
Found: 2026-03-22

## DSA5: Manöver combination limits
Per attack: max 1 Basismanöver + 1 Spezialmanöver. Passive SFs stack freely. Klingensturm and Vorstoß are both Spezialmanöver and CANNOT be combined. Without the corresponding SF, Basismanöver (Wuchtschlag, Finte, Meisterparade) are an additional -2 harder.
Affected: `engine/combat.py`
Found: 2026-03-22

## DSA5: Spell Zauberdauer counts own actions only
Multi-action spells count only the caster's own actions, not other combatants'. A spell with Zauberdauer 4 Aktionen takes 4 of the caster's Kampfrunden. If the caster is attacked during a longer spell and chooses to defend, the spell is immediately interrupted and lost.
Affected: `engine/magic.py`
Found: 2026-03-22

## DSA5: Kampfrunde duration is variable (2-5 seconds)
DSA5 Regelwerk S.226 defines a Kampfrunde as 2-5 seconds (not fixed 3 seconds as in DSA4). This matters for calculating spell durations and time-based effects.
Affected: `engine/combat.py`
Found: 2026-03-22

## Optolith vs DSA Ultimate: different JSON formats
These two apps export different JSON structures for characters. The Optolith Database Schema repo (elyukai/optolith-database-schema) documents the Optolith format. DSA Ultimate format needs sample files to reverse-engineer. Do NOT assume they are compatible without testing.
Affected: `importers/optolith.py`, `importers/dsa_ultimate.py`
Found: 2026-03-22

## Optolith: database is closed-source, schema is public
The Optolith app's actual game data (spells, creatures, etc.) is closed-source due to Ulisses licensing. But the JSON Schema definitions and TypeScript types are public on GitHub. Use the schema for import format, not as a data source.
Affected: `importers/optolith.py`
Found: 2026-03-22

## Foundry VTT DSA5: game data sold separately
The Foundry VTT DSA5 system code is open source, but creature/spell/item data is sold as premium modules via the Ulisses F-Shop. The system code (combat resolution, modifier handling) is useful as reference, the data is not freely extractable.
Affected: `engine/*` (reference only)
Found: 2026-03-22

## Regel-Wiki Scraper: outdated but functional
The DSA5RegelWikiParser (theShmoo, 2017) crawls ulisses-regelwiki.de. It may need updates for current site structure changes, but the approach is sound for one-time data extraction for the group's private use.
Affected: `databank/seed.py`
Found: 2026-03-22

## HALT button latency is critical
The GM HALT signal must reach all player phones in <100ms to be useful. If the network path is GM → cloud server → player phone, this depends on internet quality. Test this early with real devices on the group's WiFi. If latency is too high, consider WebSocket connection optimization or a "predictive freeze" on the client side.
Affected: `ws/manager.py`, `ws/handlers.py`
Found: 2026-03-22

## AI map generation: structured JSON is the safe default
Claude can generate structured map JSON (walls, objects, tokens) reliably. Image generation is more unpredictable — quality varies, style consistency is hard, and it requires a separate image API. Always default to structured/JSON maps. Image maps are a nice-to-have upgrade.
Affected: `ai/assist.py`, map rendering
Found: 2026-03-22

## Character inventory: snapshot vs base confusion
Characters have Basis-Inventar (persistent on account) and Kampagnen-Inventar (per campaign snapshot). The engine must always read from the Kampagnen-Inventar during a session, never from Basis-Inventar directly. Basis-Inventar is only relevant at campaign-join (initial copy) and campaign-end (carry-over approval). Mixing these up will cause items to appear/disappear unexpectedly.
Affected: `engine/inventory.py`, `models/character.py`
Found: 2026-03-22

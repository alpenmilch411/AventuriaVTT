# Aventuria VTT — Project Overview

## The Problem

Playing Das Schwarze Auge (DSA5 — Germany's biggest pen & paper RPG) requires a Game Master who simultaneously tells a story, enforces hundreds of pages of rules, tracks hit points and conditions for a dozen characters, draws maps, and improvises when players do the unexpected. Half of this work is creative, the other half is bookkeeping. The bookkeeping kills the flow.

## The Solution

Aventuria VTT is a browser-based toolkit that handles the bookkeeping so the GM can focus on the story. It's not a digital game — it's infrastructure for the real-life table experience.

**The GM** gets a cockpit on their laptop/tablet: scene management, combat tracking, NPC notes, maps with fog-of-war, a rules reference, and an AI assistant that whispers suggestions when they're stuck.

**Each player** gets a personal dashboard on their phone: character stats, inventory, spells, dice input, and a view of the map. They still roll physical dice — the app just tracks the results.

**A TV or projector** shows the shared view: the map, atmospheric images, handouts, and the combat log. It's a window into the game world, not a software interface.

Everyone still sits at the same table, talks, argues, laughs, and roleplays. The app is invisible infrastructure — it buzzes your phone when you need to roll dice, and otherwise stays out of the way.

## Who It's For

A friend group playing DSA5 at a physical table. Specifically: groups who are new to DSA and want help learning the rules, and groups who are experienced but tired of the bookkeeping overhead.

## What Makes It Different

- **Human GM, not AI GM**: The AI assists the GM with suggestions and content import — it never replaces them.
- **Physical table first**: Every design decision starts with "Does this help or distract from the conversation?"
- **Guided for beginners**: Step-by-step combat hints, rule explanations inline, complexity levels (Basic → Advanced) that grow with the group.
- **Persistent world**: Characters level up across campaigns, the lore book remembers who you met and what you discovered, dead characters get a memorial.
- **AI-powered prep**: Upload a PDF of a published adventure, and the app extracts scenes, NPCs, and maps automatically. The GM reviews and tweaks — prep time drops from hours to minutes.

## MVP Scope

**Version 1 does:** Character import (from Optolith/DSA Ultimate), campaign/session management with invite codes, combat tracking (initiative, attacks, defense, damage, conditions), talent/spell probes, grid-based maps with tokens and fog, real-time sync across all devices, basic AI assist for the GM.

**Version 1 does not:** Character creation from scratch, music/ambiance, image-based map generation, community sharing, multiple RPG system support.

## Vision

A tool so good that no DSA group wants to play without it — not because it replaces anything, but because it makes everything smoother. Long-term: support for other RPG systems, a marketplace for community-created adventures and assets, and AI that can prep an entire adventure from a PDF in 10 minutes.

## Key Assumptions

1. The group plays physically at a table (not remote/online — that's a different product)
2. Everyone has a smartphone and there's WiFi at the table
3. The GM is willing to do some digital prep (importing adventures, setting up maps)
4. Players accept typing dice results instead of the app "seeing" their dice (camera recognition is a future feature)
5. A cloud-hosted service is acceptable (accounts, data stored centrally)

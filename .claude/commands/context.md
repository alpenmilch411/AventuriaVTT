Read the following files in order, then report status:

1. Read CLAUDE.md (full)
2. Read GOTCHAS.md (full)
3. Read the last 3 entries in DEVLOG.md (newest first — the file is long; don't read beyond the first 3 sessions)
4. Run `git log --oneline -10` to see recent commits — if the last commit is newer than the last DEVLOG entry, a previous session ended without `/log`. Note what was committed but not logged.
5. Read ROADMAP.md — look at "Current Milestone" section (active work only; the full phase archive lives in SPEC.md § 11, do not auto-read it)
6. Skim the Quick Reference at the top of SPEC.md (~20 lines) so you know which section to consult if the milestone touches a specific area. Do not read the rest of SPEC.md unless the milestone requires it.

Then respond with EXACTLY this format:

**Project Context Loaded**
- Last session: [what the last DEVLOG entry says was done]
- Unlogged work: [any commits newer than last DEVLOG entry, or "none"]
- Current milestone: [title and goal from ROADMAP.md]
- Done criteria: [the checklist items from Current Milestone]
- Relevant gotchas: [any GOTCHAS.md entries related to this milestone, or "none"]

If there is unlogged work, say: "I see commits that weren't logged. Let me update DEVLOG.md to capture what happened." Then write a DEVLOG entry based on the commit messages before proceeding.

Then end with: "Ready to work on [milestone title]. Confirm to start, or redirect me."

The goal, scope, and done-when are already in ROADMAP.md — do NOT ask the user to restate them. Wait for a confirm or a redirect. Once confirmed, invoke Superpowers' brainstorming skill on the milestone goal directly from ROADMAP.md. Do NOT write implementation plans yourself — let Superpowers handle that.

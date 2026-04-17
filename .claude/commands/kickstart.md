Analyze this existing codebase and generate project memory files for multi-session Claude Code development. Do the following:

## Step 1: Read the Codebase

1. Run `find . -type f -name "*.md" -maxdepth 2 | head -20` — check if kickstart files already exist (CLAUDE.md, SPEC.md, ROADMAP.md). If they do, STOP and say "This project already has kickstart files. Use `/context` to load them."
2. Run `ls -la` and examine the top-level directory structure
3. Read package.json, requirements.txt, Cargo.toml, go.mod, or whatever dependency files exist
4. Read any existing README, docs, or config files
5. Scan key source files to understand the architecture — focus on entry points, routes, models, and config. Do NOT read every file — sample 10-15 representative files across the codebase.
6. Run `git log --oneline -20` to understand recent development history
7. Check for existing tests — `find . -type f -name "*test*" -o -name "*spec*" | head -10`

## Step 2: Generate Files

Based on what you found, create ALL of the following files in the project root:

### CLAUDE.md (<120 lines)
- What the project is (2-3 sentences, based on what the code actually does)
- Superpowers integration section (use standard text from below)
- Workflow section: `/context` at start, `/log` at end
- Repo structure (actual directory tree)
- Key technical decisions (inferred from the stack and patterns you see)
- Any security or constraint rules you can infer

Standard Superpowers section:
```
## Superpowers Integration
This project uses the Superpowers plugin for coding discipline. Kickstart files handle project memory.
- **Superpowers** handles: brainstorming, implementation plans, TDD, code review, git worktrees, verification
- **Kickstart files** handle: what to build next (ROADMAP.md), architecture (SPEC.md), session log (DEVLOG.md), traps (GOTCHAS.md)

If Superpowers is not installed: `/plugin install superpowers@claude-plugins-official`
```

### SPEC.md
Full technical specification based on the ACTUAL codebase:
- Sec 1: Project overview
- Sec 2: Current state (what works, what's broken if apparent, what's missing)
- Sec 3: Tech stack (real versions from dependency files)
- Sec 4: Architecture (real file tree, real data flow based on code)
- Sec 5: Data models (real schemas from code/migrations)
- Sec 6: External dependencies (real env vars, APIs, services)
- Sec 7: Conventions (patterns you observe in the code: naming, error handling, etc.)
- Sec 8: Deployment (infer from Dockerfile, CI config, or note as unknown)
- Sec 9+: Feature-area deep dives and a Roadmap/phase archive

### ROADMAP.md
- Current Milestone: Ask the user "What do you want to work on first?" — leave this blank until they answer
- Backlog: Empty — the user will fill this in conversation
- Completed Milestones: seed from git history or leave empty

### DEVLOG.md
- Session 0 entry titled "Kickstart — Codebase Analysis"
- Document what you found: stack, architecture, patterns, any concerns about code quality
- List any bugs, tech debt, or issues you noticed during the scan
- Note test coverage status (tests exist? how many? what's untested?)

### GOTCHAS.md
Pre-seed with any traps you discovered:
- Unusual patterns that could trip up future sessions
- Missing error handling you noticed
- Outdated dependencies
- Anything that looks fragile or likely to break

### .claude/commands/context.md and log.md
Use the standard commands that live in this project's `.claude/commands/` — context.md reads CLAUDE/GOTCHAS/DEVLOG/ROADMAP and reports status; log.md updates ROADMAP/DEVLOG/GOTCHAS/SPEC and stages doc changes.

## Step 3: Present Results

After creating all files, show the user:
1. A summary of what you found in the codebase
2. Any concerns about code quality, missing tests, or fragile patterns
3. Ask: "What do you want to work on first? I'll set it as the current milestone."

Then wait for their answer and write the Current Milestone in ROADMAP.md based on their response.

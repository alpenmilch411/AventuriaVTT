# Contributing

Aventuria VTT is a personal / vibecoded project built to support one DSA5 group's sessions. Contributions from friends are very welcome.

You don't need to be a coder. The whole project was built with AI assistants (Claude Code, Codex) and that's how you're expected to contribute too.

## The big picture

1. Make your own copy of the repo — a **fork**.
2. Work on your fork — in the browser for tiny edits, or locally with Claude Code / Codex for anything real.
3. Open a **pull request (PR)** back to this repo.
4. Yannik reviews, you iterate if needed, then it gets merged.

Nothing lands on `main` until a PR is approved. That's the only gate.

## Step 1 — Fork the repo (one-time, ~10 seconds)

1. Go to the project repo on GitHub.
2. Click **Fork** (top-right). Accept the defaults.
3. You now have your own copy at `github.com/YOUR-USERNAME/AventuriaVTT`.

This is your sandbox. You can break it freely — it doesn't touch the main copy.

## Step 2 — Make changes

### Option A — Tiny text edits (typo, wording, a single line)

Do it in the browser:

1. On **your fork**, open the file you want to change.
2. Click the **pencil icon** top-right of the file view.
3. Edit, scroll down, add a short commit message, click **Commit changes**.
4. Skip to Step 3.

### Option B — Real changes (new feature, bug fix, anything non-trivial)

Use an AI assistant. Two good options:

**Claude Code** *(recommended — the project is built around it)*
1. Install Claude Code from Anthropic's docs.
2. Clone your fork locally: `git clone git@github.com:YOUR-USERNAME/AventuriaVTT.git && cd AventuriaVTT`
3. Run `claude` in the project folder.
4. Start your session with **`/context`** — it reads `CLAUDE.md`, `GOTCHAS.md`, the last few `DEVLOG.md` entries, and the current milestone. This is important: without it Claude has no idea what's going on in the project.
5. Describe what you want to change in plain English. Claude will do the edits.
6. When done, run **`/log`** before quitting — it updates the session log and the docs.

**Codex / ChatGPT Codex CLI**
1. Install per OpenAI's docs.
2. Same pattern: describe the change in plain English, Codex does the edits.
3. The project has a `codex-companion.mjs` helper for getting a second opinion on code from Codex — optional, but useful for DSA5 rule changes. See the "Codex as Reviewer" section in `CLAUDE.md`.

**No terminal at all? Use GitHub Codespaces.** On your fork, click **Code → Codespaces → Create codespace on main**. That gives you a full dev environment in the browser — no local installs. Claude Code and Codex run inside the codespace terminal the same as a local setup. Free tier available on personal accounts.

### While working with AI

- **Commit early, commit often.** Don't let the AI rewrite half the codebase in one shot. Small, scoped commits are easier to review.
- **Open the PR as a Draft early** (Step 3 below). That lets Yannik see the direction before lots of AI-generated code piles up.
- **Don't blindly accept everything.** For anything touching DSA5 rules (`backend/engine/` or `frontend/src/engine/`), the AI sometimes guesses and gets it wrong. Double-check rule logic against the Regelwerk.
- **Never commit `.env` or API keys.** The AI will usually notice, but review the diff before pushing.

## Step 3 — Open a pull request

After pushing changes to your fork:

1. Go to your fork on github.com.
2. A yellow banner appears: *"This branch is X commits ahead of alpenmilch411:main"* — click **Contribute → Open pull request**.
3. Give it a short title and a sentence about what and why.
4. If it's not done yet, click **Create draft pull request** so it's marked work-in-progress.
5. Yannik will review and comment. Push more commits to the same branch to address feedback.
6. Once approved, it gets merged into `main`.

## House rules

- **User-facing text is German.** Variable names, code comments, and commit messages stay in English.
- **No emojis in code** unless explicitly asked for.
- **Don't commit secrets** — no `.env`, no API keys, no private tokens. `.env.example` is fine; real values are not.
- **DSA5 abbreviations** (MU/KL/IN/CH/FF/GE/KO/KK attributes, LeP/AsP/KaP/SchiP vitals, AT/PA/AW/FK combat, RS/BE armor, TP/SP damage, QS quality level, FW skill value) — keep these consistent. Full list in `CLAUDE.md`.

## Where the docs live (and what your AI assistant should read)

- `CLAUDE.md` — workflow rules, project conventions. Claude Code reads this automatically.
- `SPEC.md` — architecture source of truth. If you change how something works at the system level, update the matching section.
- `GOTCHAS.md` — non-obvious traps and DSA5 rule gotchas. Add a short entry if you hit one.
- `ROADMAP.md` — what's planned next.
- `DEVLOG.md` — session history, newest first.

## Questions or ideas

- Open an issue on GitHub for bugs or feature thoughts.
- For anything bigger (new system, mechanic rewrite), open an issue first to discuss — saves rework.
- Or just message Yannik directly.

## License

This project is [PolyForm Noncommercial 1.0.0](LICENSE). By opening a pull request you agree your contribution is released under the same license.

Das Schwarze Auge / DSA / Aventuria and related trademarks belong to Ulisses Spiele. This is unofficial, noncommercial fan work — see `NOTICE`.

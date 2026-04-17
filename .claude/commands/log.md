Perform ALL of the following steps. Do not skip any.

1. **Update ROADMAP.md**: Check off completed "Done when" items in Current Milestone.

2. **If Current Milestone is fully complete:**
   a. Move the completed milestone to "Completed Milestones" at the bottom
   b. Promote the next backlog item to "Current Milestone"
   c. Read the relevant SPEC.md sections for the new milestone
   d. Write a clear Goal, Scope (2-3 sentences), SPEC.md reference, and "Done when" checklist
   e. Remove that item from the Backlog table
   f. Show the user the new Current Milestone and ask: "This is queued up next. Look right?"

3. **If Current Milestone is NOT fully complete:**
   - Note which "Done when" items are checked vs remaining
   - Record in DEVLOG where you stopped

4. **Update DEVLOG.md**: Prepend a new entry at the top with:
   - Session number + title + date
   - What was built/changed (specific files and features)
   - Key decisions made during this session
   - Bugs or gotchas discovered
   - What the next session should start with

5. **Update GOTCHAS.md**: If any non-obvious behavior or DSA5 rules traps were discovered, add them using the format:
   ```
   ## Short descriptive title
   Explanation of the trap, what goes wrong, the workaround.
   Affected: files / modules
   Found: YYYY-MM-DD
   ```

6. **Update SPEC.md** if any of these changed:
   - New dependencies → Tech Stack / Section 3
   - Schema changes → Data Models / Section 6
   - New env vars → External Dependencies / Section 3
   - New API endpoint or WS message type → Architecture / Sections 4-8
   - New file or module changes repo structure → Architecture / Section 4
   - Completed phase item → check off in Section 11 archive

7. **Stage doc changes**: `git add ROADMAP.md DEVLOG.md GOTCHAS.md SPEC.md CLAUDE.md`

8. **Report**: Summary of what was logged. Remind user to commit and push.

Do NOT skip the DEVLOG entry.

---
id: BACK-723
title: Replace captured agent previews with native tmux Board and Workspace windows
status: In Progress
assignee:
  - '@OpenCode'
created_date: '2026-10-01 08:34'
updated_date: '2026-10-01 15:37'
labels:
  - tui
  - terminal
dependencies: []
type: enhancement
ordinal: 357000
---

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the workspace topology rebuild and real-tmux test harness. 2. Treat a persisted Workspace window ID as absent only after confirming it is not a current session window, while preserving real tmux removal failures. 3. Add a real tmux regression that removes Workspace, preserves Board, and verifies showWorkspace recreates topology. 4. Run focused tests, type-check, Biome, and build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Replaced bootstrap tmux wait-for locking with the shared proper-lockfile owner and added a real-tmux stale-lock recovery regression that kills the lock-acquisition process before workspace startup.

Added session-membership validation for the persisted Workspace window ID. Missing IDs now trigger topology rebuild without kill-window; an existing member still uses strict removal. Added a real-tmux regression that removes Workspace, preserves Board, and verifies showWorkspace recreates five panes. Verified with bun test --timeout=10000 src/test/tmux-workspace.test.ts, bunx tsc --noEmit, bun run check ., and bun run build.
<!-- SECTION:NOTES:END -->

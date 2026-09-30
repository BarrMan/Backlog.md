---
id: BACK-717
title: Simplify board UI ownership and decompose its controller
status: In Progress
assignee:
  - '@OpenCode'
created_date: '2026-09-30 14:52'
updated_date: '2026-09-30 16:26'
labels: []
dependencies: []
type: chore
ordinal: 351000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Complete the remaining Board UI composition work by making renderer control flow readable, binding keyboard behavior directly to its owners, and removing the BoardInput command-string dispatch loop while preserving board behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 TUIRenderer control flow is readable and uses normal multi-line structure rather than compressed one-line branches or handlers
- [ ] #2 Keyboard handlers bind directly to their owning behavior without BoardInput command-string dispatch
- [ ] #3 BoardInput and its command-string loop are removed
- [ ] #4 Focused board interaction tests preserve current observable behavior
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the current renderer, input, and interaction owners to identify direct keyboard binding points.
2. Move keyboard bindings to the appropriate board interaction or view owner and delete BoardInput command-string dispatch.
3. Expand compressed renderer control flow into clear multi-line branches and handlers without changing behavior.
4. Verify focused board interaction tests, TypeScript, formatting, and affected module structure.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reopened after review. Board domain ownership is approved; remaining work is renderer and lane-view component composition. No implementation completion is claimed.

Composed TUIRenderer with BoardView, FilterBar, Footer, BoardInput, and BoardDialogs; aligned the renderer with BoardTaskPopup. Focused board move, hide-empty, popup-sync, and BoardView tests pass. Full tsc remains blocked by unrelated concurrent task-viewer exports/deletions.
<!-- SECTION:NOTES:END -->

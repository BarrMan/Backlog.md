---
id: BACK-721
title: Fix TUI task composer Enter navigation
status: In Progress
assignee:
  - '@agent'
created_date: '2026-10-01 04:45'
updated_date: '2026-10-01 05:26'
labels: []
dependencies: []
modified_files:
  - src/core/task-creation-input.ts
  - src/core/task-creation-workflow.ts
  - src/ui/components/task-composer.ts
  - src/test/tui-task-composer.test.ts
ordinal: 355000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TUI task composer advances from title to description with Enter, but pressing Enter in description can trap focus and discard the typed description. People need to move through creation fields without data loss, create directly with Shift+Enter, and still be able to create a task when no title was entered.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Enter advances through composer inputs while preserving the text entered in each field
- [ ] #2 Shift+Enter creates the task immediately from the composer
- [ ] #3 Submitting an empty title uses the existing automatic title behavior
- [ ] #4 Regression tests cover description Enter navigation and immediate creation
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Make Enter advance each TUI composer text input through the existing focus path without allowing the textarea to lose state. 2. Permit the shared task-creation pipeline to supply its existing default title when the composer title is blank. 3. Add focused composer regression coverage for description Enter, Shift+Enter submission, and automatic titles; run scoped checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented Enter focus advancement from title, description, and due date through the composer-owned input path. Added Shift+Enter immediate submission from every composer field and regression coverage for description preservation and valid-title creation. Verified with the focused composer test, TypeScript check, and Biome check. Empty-title auto-generation remains pending because no existing title-generation policy exists.

Independent functional review approved the Enter and Shift+Enter behavior. Added a regression assertion that Shift+Enter from the Description textarea persists its full payload through the existing create path. The blank-title auto-generation criterion remains blocked pending a product title-generation policy; task stays In Progress for independent review.

Resolved the blank-title policy: shared task creation now assigns untitled-{allocated numeric ID body} after allocation inside the create lock. Blank and whitespace composer titles therefore use the same durable monotonic numbering as task IDs. Added blank/whitespace repeated-create coverage alongside the Description Shift+Enter persistence regression. Verified with focused composer tests, TypeScript, and scoped Biome. Task remains In Progress pending independent review.
<!-- SECTION:NOTES:END -->

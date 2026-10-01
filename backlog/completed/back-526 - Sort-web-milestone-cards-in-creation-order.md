---
task_schema_version: 2
id: BACK-526
title: Sort web milestone cards in creation order
status: Done
assignee:
  - '@Codex'
created_date: '2026-07-08 20:31'
updated_date: '2026-07-08 20:31'
labels: []
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/pull/644'
  - 'https://github.com/MrLesk/Backlog.md/issues/736'
modified_files:
  - src/web/components/MilestonesPage.tsx
  - src/test/web-milestones-page-search.test.tsx
ordinal: 167000
description: >-
  The browser milestones page should display numeric milestone cards in creation
  order instead of reverse creation order. This keeps phase and sprint
  milestones readable when users create them sequentially.
implementation_plan: >-
  1. Rebase the PR branch onto latest main.

  2. Change the milestone card comparator to ascending numeric ID order.

  3. Update tests to assert the new card order and adjust first-card
  interactions.

  4. Run focused and full validation before handoff.
implementation_notes: >-
  Implemented in PR #644. Updated src/web/components/MilestonesPage.tsx and
  src/test/web-milestones-page-search.test.tsx.


  Validation on the rebased branch passed: bun test
  src/test/web-milestones-page-search.test.tsx
  src/test/web-milestones-page-unassigned-filter.test.tsx
  src/web/utils/milestones.test.ts (27 pass, 0 fail).
final_summary: >-
  PR #644 sorts numeric milestone cards ascending, keeps non-numeric milestones
  after numeric IDs, and verifies the behavior with milestone page tests plus
  full validation.
acceptance_criteria:
  - index: 1
    text: Numeric milestone IDs render in ascending order on the milestones page.
    checked: true
  - index: 2
    text: Milestone page tests cover the new order and card interactions.
    checked: true
  - index: 3
    text: Focused milestone page tests pass with the ordering expectations.
    checked: true
definition_of_done: []
comments: []
---

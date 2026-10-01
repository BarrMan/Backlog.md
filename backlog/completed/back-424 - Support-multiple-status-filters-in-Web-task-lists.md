---
task_schema_version: 2
id: BACK-424
title: Support multiple status filters in Web task lists
status: Done
assignee:
  - '@codex'
created_date: '2026-04-25 12:14'
updated_date: '2026-08-10 05:35'
labels:
  - web-ui
  - filters
  - enhancement
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/502'
priority: medium
description: >-
  Track GitHub issue #502: allow filtering Web UI task lists by more than one
  status at the same time.
implementation_plan: >-
  1. Represent included Web task-list statuses as an ordered array parsed from
  repeated status URL parameters, preserving the existing single-status URL
  shape.

  2. Reuse the existing checkbox filter control and array-capable search API,
  keeping include/exclude/priority/label/milestone URL synchronization and reset
  behavior consistent.

  3. Add focused component tests for legacy single-status URLs, multi-status
  selection/search/URL persistence, terminal cleanup visibility, and clearing
  filters; then run scoped and repository checks.
implementation_notes: >-
  Replaced the scalar included-status filter with an ordered array and reused
  the existing checkbox dropdown. Selected statuses are serialized as repeated
  status query parameters; a single selection keeps the existing
  single-parameter URL. The Web search client and server already accept status
  arrays, so no new API surface was needed.


  Validation: 48 scoped component/search/server tests passed; bunx tsc --noEmit,
  bun run check . (369 files), and bun run build passed. Rendered QA at 1280x800
  selected To Do + In Progress, produced ?status=To+Do&status=In+Progress, and
  showed 38 matching rows with no other statuses; Clear filters restored all 145
  rows. The status menu remained usable at 390x844 with the sidebar collapsed.
  Browser console had no warnings or errors.
final_summary: >-
  Added multi-select status filtering to the Web task list with repeated URL
  parameters and legacy single-status URL compatibility. Verified
  multi-selection, API requests, reset behavior, terminal cleanup visibility,
  responsive interaction, TypeScript, formatting, build, and 48 scoped tests.
acceptance_criteria:
  - index: 1
    text: The Web task list can filter by multiple selected statuses.
    checked: true
  - index: 2
    text: Filter state is reflected in the URL or existing persisted filter state.
    checked: true
  - index: 3
    text: Clear/reset behavior returns the list to the unfiltered status set.
    checked: true
  - index: 4
    text: Tests cover multi-status selection and reset.
    checked: true
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: true
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: true
  - index: 3
    text: bun test (or scoped test) passes
    checked: true
comments: []
---

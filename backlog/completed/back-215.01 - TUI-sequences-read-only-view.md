---
task_schema_version: 2
id: BACK-215.01
title: 'TUI sequences: read-only view'
status: Done
assignee:
  - '@codex'
created_date: '2025-08-23 19:12'
updated_date: '2025-08-23 22:32'
labels:
  - sequences
dependencies: []
parent_task_id: task-215
description: >-
  Render a read-only TUI view of sequences using the core compute function
  (task-213). Show sequences vertically with each task as "task-<id> - <title>".
implementation_plan: |-
  Plan:

  - Add read-only blessed TUI view for sequences.
  - Use computeSequences to populate groups; no extra logic.
  - Render vertically: "Sequence <n>" header + "task-<id> - <title>" lines.
  - Keys: q/Esc to exit; arrows not required yet.
  - Replace interactive path of `sequence list` to call this view.
  - Ensure large lists render without crashing; avoid heavy reflow.
implementation_notes: >-
  Implementation Notes:


  - Added `runSequencesView` in `src/ui/sequences.ts` using blessed; read-only,
  scrollable, exits with `q`/`Esc`.

  - Wired CLI interactive path (`backlog sequence list`) to call the new view;
  `--plain` output unchanged.

  - Uses `computeSequences` from core to populate groups; no duplicate logic.

  - Renders lines as `Sequence <n>:` followed by `task-<id> - <title>`.

  - Designed for large lists: scrollable container with `alwaysScroll` and
  minimal reflow.


  Updated TUI to render one bordered block per sequence, labeled and stacked
  vertically. Interactive default invokes the TUI; --plain unchanged. Verified
  type-check and relevant tests.


  Final check: Verified bordered blocks render correctly without overlapping
  container borders (left:0, right:0). Ready to proceed to navigation/detail in
  215.02.
acceptance_criteria:
  - index: 1
    text: Lists sequences using computeSequences results
    checked: true
  - index: 2
    text: Displays tasks under each sequence as task-<id> - <title>
    checked: true
  - index: 3
    text: No crashes when rendering large lists
    checked: true
  - index: 4
    text: >-
      Render each sequence as a bordered block labeled "Sequence <n>" with tasks
      inside
    checked: true
definition_of_done: []
comments: []
---

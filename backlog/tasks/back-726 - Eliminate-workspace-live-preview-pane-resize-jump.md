---
task_schema_version: 2
id: BACK-726
title: Eliminate workspace live-preview pane resize jump
status: In Progress
assignee:
  - '@worker'
created_date: '2026-10-02 10:25'
updated_date: '2026-10-02 13:20'
labels:
  - tui
  - terminal
dependencies: []
modified_files:
  - src/agent-workspace/tmux-workspace.ts
  - src/test/tmux-workspace.test.ts
ordinal: 360000
description: >-
  Selecting a task with a running live agent preview still causes a brief
  visible layout/resize jump before the preview settles, even after pre-sizing
  the parked agent pane before tmux swap-pane.


  Observed behavior:

  - In CLI workspace task list, selecting a task with live preview visible
  causes the preview area/screen to jump briefly, then settle roughly ~200ms
  later.

  - This still happens after commit 0c8b3c99 (pre-size agent preview panes), so
  simply resizing the parked pane to the display slot before swap-pane is
  insufficient.


  Relevant recent work:

  - BACK-724 fixed stale tmux pane recovery and non-focusing preview swaps.

  - BACK-725 decoupled durable app/session state from tmux renderer pane IDs.

  - 0c8b3c99 added fitPaneToDisplay() in src/agent-workspace/tmux-workspace.ts
  before showAgentPane() swap-pane.


  Hypothesis to investigate:

  - tmux swap-pane may still trigger a visible relayout/redraw even if the
  source pane window is pre-sized.

  - Agent panes may need to remain mounted in stable same-size containers, use a
  different tmux primitive, keep a persistent display/parking layout of
  identical geometry, or update the preview presentation model.
final_summary: ''
acceptance_criteria:
  - index: 1
    text: Reproduce and characterize the jump with the current implementation.
    checked: false
  - index: 2
    text: >-
      Determine whether it is caused by tmux swap-pane geometry, pane content
      redraw, workspace UI redraw, or focus/selection updates.
    checked: false
  - index: 3
    text: >-
      Implement a solution that avoids visible jump when switching between
      already-running previews, or document a clear tmux limitation and propose
      the smallest viable product/architecture change.
    checked: false
  - index: 4
    text: >-
      Add regression coverage where practical for tmux commands/order/geometry
      behavior.
    checked: false
  - index: 5
    text: 'Validate with focused workspace/tmux tests, typecheck, and Biome.'
    checked: false
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: false
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: false
  - index: 3
    text: bun test (or scoped test) passes
    checked: false
comments: []
---

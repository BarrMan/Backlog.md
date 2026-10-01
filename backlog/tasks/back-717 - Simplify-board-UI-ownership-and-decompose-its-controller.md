---
task_schema_version: 2
id: BACK-717
title: Simplify board UI ownership and decompose its controller
status: Done
assignee:
  - '@OpenCode'
created_date: '2026-09-30 14:52'
updated_date: '2026-09-30 19:08'
labels: []
dependencies: []
type: chore
ordinal: 351000
description: >-
  Complete the remaining Board UI composition work by making renderer control
  flow readable, binding keyboard behavior directly to its owners, and removing
  the BoardInput command-string dispatch loop while preserving board behavior.
implementation_plan: >-
  1. Inspect board renderer, interaction modules, models, and focused tests to
  map direct imports and ownership. 2. Move board view pieces into components/,
  Board Filter Lane domain into models/, and cohesive board policies into
  policies/; retarget affected external imports directly. 3. Expand TUIRenderer
  control flow while preserving existing direct bindings and behavior. 4. Run
  focused board tests and report any cross-agent type-check limitations.


  5. Retarget the remaining board consumers to task-viewer/controller.ts, remove
  pure root forwarding shells, update meaningful code-path fixtures, and verify
  only affected UI and CLI paths.
implementation_notes: >-
  Reopened after review. Board domain ownership is approved; remaining work is
  renderer and lane-view component composition. No implementation completion is
  claimed.


  Composed TUIRenderer with BoardView, FilterBar, Footer, BoardInput, and
  BoardDialogs; aligned the renderer with BoardTaskPopup. Focused board move,
  hide-empty, popup-sync, and BoardView tests pass. Full tsc remains blocked by
  unrelated concurrent task-viewer exports/deletions.


  Moved board widgets to components/, Board/Filter/Lane to models/, and pure
  board rules to policies/; kept renderer, interaction, actions, configuration,
  and screen lifecycle at the board root. Expanded TUIRenderer control flow
  while preserving direct bindings. Focused board tests pass (63 tests). Full
  tsc remains blocked by concurrent non-board CLI/command reorganization errors.


  Integration cleanup retargeted board navigation consumers to
  ui/task-viewer/controller.ts and removed the obsolete root forwarding shells;
  focused board/path verification and tsc pass.
final_summary: >-
  Completed readable TUIRenderer control flow and direct shortcut ownership;
  removed BoardInput dispatch and remaining forwarding shells. Board move,
  hide-empty, and popup interaction tests pass in the integrated runner.
  TypeScript, Biome and build pass.
acceptance_criteria:
  - index: 1
    text: >-
      TUIRenderer control flow is readable and uses normal multi-line structure
      rather than compressed one-line branches or handlers
    checked: true
  - index: 2
    text: >-
      Keyboard handlers bind directly to their owning behavior without
      BoardInput command-string dispatch
    checked: true
  - index: 3
    text: BoardInput and its command-string loop are removed
    checked: true
  - index: 4
    text: Focused board interaction tests preserve current observable behavior
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

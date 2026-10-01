---
task_schema_version: 2
id: BACK-719
title: Reorganize source into functional folders
status: Done
assignee:
  - '@OpenCode'
created_date: '2026-09-30 16:26'
updated_date: '2026-09-30 19:08'
labels: []
dependencies: []
type: chore
ordinal: 353000
description: >-
  The repository structure contains singleton directories and forwarding shells
  that obscure functional ownership. Reorganize source by feature or functional
  responsibility so modules live with the behavior they own and imports are
  direct.
implementation_plan: >-
  1. Consolidate configuration, initialization, and task command implementation
  into functional CLI feature folders; update direct imports and command
  registration only where required.

  2. Remove forwarding-only task-viewer and unified UI shells by moving shared
  task popup behavior to an owning shared module and importing implementations
  directly.

  3. Group substantive workspace and web UI feature files only where their
  existing ownership is cohesive, excluding src/ui/board/** and the untracked
  workspace-config-dialog draft.

  4. Run targeted type, formatting, and affected command/UI tests; simplify any
  unnecessary forwarding or duplicate structure.


  5. Retarget the remaining board consumers to task-viewer/controller.ts, remove
  pure root forwarding shells, update meaningful code-path fixtures, and verify
  only affected UI and CLI paths.
implementation_notes: >-
  Moved config, init, and task command modules into CLI feature folders; removed
  direct-consumer UI forwarding shells; moved task popup implementation into
  ui/shared. Board owner API recorded in task comment. Targeted Biome check and
  five affected test files pass; tsc passes.


  Also grouped the workspace UI controller, model, and reconciliation files
  under src/ui/workspace without changing workspace behavior; left the untracked
  src/ui/workspace-config-dialog.ts draft untouched. Four workspace-focused test
  files pass.


  Retargeted board and affected test consumers to ui/task-viewer/controller.ts;
  removed pure ui root forwarding shells for board screen lifecycle, task-viewer
  lifecycle, and task-viewer controller. Updated live path fixtures. Focused
  board/path, dependency/readiness, config/wizard tests, targeted Biome, and tsc
  pass.
final_summary: >-
  Grouped board components/models/policies, CLI config/init/task implementation
  modules and workspace UI by responsibility. Removed obsolete
  task-viewer/unified forwarding shells and moved shared popup behavior to its
  real shared owner. Updated real imports, mocks and path fixtures. Focused CLI,
  workspace, board and path tests pass; integrated TypeScript, Biome and build
  pass.
acceptance_criteria:
  - index: 1
    text: >-
      Source folders group modules by functional responsibility rather than
      singleton directory names
    checked: true
  - index: 2
    text: Singleton directories without a clear functional boundary are eliminated
    checked: true
  - index: 3
    text: >-
      Forwarding shell modules are removed and consumers import the owning
      implementation directly
    checked: true
  - index: 4
    text: 'Type checking, formatting, and affected tests pass'
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
comments:
  - index: 1
    body: >-
      Coordination for board owner: root UI forwarding paths are being removed.
      Use `../task-viewer/controller.ts` for TaskViewerController/navigation
      helpers and `../shared/task-popup.ts` for createTaskPopup; unified
      controller is `../unified/controller.ts`.
    created_date: '2026-09-30 17:01'
    author: '@OpenCode'
---

---
task_schema_version: 2
id: BACK-625
title: Align MCP task reads with the CLI local-first approach
status: To Do
assignee: []
created_date: '2026-08-10 06:10'
updated_date: '2026-08-10 07:13'
labels: []
dependencies: []
ordinal: 261000
description: >-
  Owner ruling (2026-08-10, BACK-623/BACK-624 fix round): CLI task commands are
  local-only (working copy active + completed) because that is what makes the
  product usable; web stays cross-branch on its long-lived store. MCP should
  follow the CLI approach: route MCP single-task reads, edits, and validation
  through the same local working-copy resolution the CLI uses, instead of the
  cross-branch corpus. Keep fail-closed local ambiguity behavior. Not part of
  the v1.50.x hotfix release.
implementation_notes: >-
  Concrete mismatch found in the PR #898 verification round: MCP reads are still
  cross-branch (getTask/getTaskWithSubtasks in src/mcp/tools/tasks/handlers.ts)
  while MCP create-parent/dependency validation is now local, so an MCP agent
  can get TASK-99 and then fail to create a task with --parent TASK-99. Aligning
  MCP reads local-first (this task) resolves that asymmetry.
acceptance_criteria:
  - index: 1
    text: >-
      MCP task view/edit resolve IDs through the same local active+completed
      resolution as the CLI, with fail-closed ambiguity
    checked: false
  - index: 2
    text: >-
      MCP responses for a task that exists only on another branch match the CLI
      behavior, including the branch-aware not-found hint
    checked: false
  - index: 3
    text: >-
      No MCP task read or edit triggers remote fetches or cross-branch corpus
      loads
    checked: false
  - index: 4
    text: >-
      Existing MCP cross-branch consumers that must keep corpus access (if any)
      are identified and documented in the task before implementation
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

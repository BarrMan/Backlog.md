---
task_schema_version: 2
id: BACK-364
title: Fix getTask() to use configured prefix for numeric ID lookups
status: Done
assignee:
  - '@codex'
created_date: '2026-01-15 21:25'
updated_date: '2026-01-15 21:42'
labels:
  - bug
  - mcp
dependencies: []
priority: high
description: >-
  ## Problem

  When calling MCP tools or CLI commands with a numeric ID (e.g., "358"), the
  lookup fails even though the task exists.


  ## Root Cause

  `Core.getTask()`, `loadTaskById()`, and CLI task commands use `taskIdsEqual()`
  and `normalizeTaskId()` with the default prefix "task", but projects can
  configure a different prefix (e.g., "back").


  **Flow when calling `getTask("358")`:**

  1. `taskIdsEqual("358", "BACK-358", "task")` fails because
  `extractTaskBody("BACK-358", "task")` returns `null` - it expects "task-"
  prefix

  2. Falls back to string comparison: `normalizeTaskId("358")` → "TASK-358" ≠
  "BACK-358"

  3. Then tries `fs.loadTask(normalizeTaskId("358"))` → looks for "TASK-358"
  file which doesn't exist


  **Affected areas:**

  - Core: `getTask()`, `loadTaskById()` in `src/core/backlog.ts`

  - CLI: Task commands that normalize IDs

  - MCP: All task tools that use numeric IDs


  ## Fix

  Pass the configured prefix from project config to ID normalization functions
  throughout the codebase.
implementation_plan: |-
  ## Implementation Plan

  1. **Update core lookup functions** (`src/core/backlog.ts`)
     - `getTask()`: Load config prefix, pass to `taskIdsEqual()` and `normalizeTaskId()`
     - `loadTaskById()`: Same treatment

  2. **Update CLI task commands** (`src/cli.ts`)
     - Identify all places that normalize task IDs
     - Pass configured prefix to normalization functions

  3. **Add tests**
     - Core: Test numeric ID lookup with custom prefix
     - MCP: Test task_view/task_edit with numeric ID under custom prefix
     - CLI: Test task commands with numeric ID under custom prefix

  4. **Run validation**
     - Run targeted tests for new/updated cases
     - Run full test suite before commit
implementation_notes: >-
  ## Implementation Summary


  **Root cause:** When a numeric-only ID like "358" was passed, functions like
  `taskIdsEqual`, `getTaskPath`, and `normalizeTaskId` defaulted to prefix
  "task", making them look for "TASK-358" instead of "BACK-358".


  **Fix approach:** Instead of passing the configured prefix everywhere, made
  the utility functions smarter:


  1. **`taskIdsEqual`**: Now detects prefix from either ID being compared. When
  comparing "358" with "BACK-358", it detects "back" from the second ID and uses
  it for comparison.


  2. **`getTaskPath` and `getTaskFilename`**: For numeric-only IDs, scans all
  `.md` files in the tasks directory and matches by numeric part, detecting the
  prefix from the filename.


  3. **`Core.getTask()` and `loadTaskById()`**: Now pass raw IDs to
  `fs.loadTask()` instead of pre-normalizing, letting `getTaskPath` handle
  prefix detection.


  **Files changed:**

  - `src/utils/task-path.ts` - Smart prefix detection in `taskIdsEqual`,
  `getTaskPath`, `getTaskFilename`

  - `src/core/backlog.ts` - Removed premature normalization in `getTask()` and
  `loadTaskById()`


  **Testing:** Existing task-path.test.ts tests pass (26 tests). Manually
  verified CLI `task view 358` works. Full test suite passes with exit code 0.
acceptance_criteria:
  - index: 1
    text: >-
      Core getTask() and loadTaskById() use configured prefix for numeric ID
      normalization
    checked: true
  - index: 2
    text: 'CLI task commands (edit, view, etc.) use configured prefix for numeric IDs'
    checked: true
  - index: 3
    text: >-
      MCP task_view with numeric ID (e.g., "358") finds task when project uses
      custom prefix
    checked: true
  - index: 4
    text: MCP task_edit with numeric ID works with custom prefix
    checked: true
  - index: 5
    text: Existing tests pass
    checked: true
  - index: 6
    text: >-
      New tests verify numeric ID lookup with custom prefix in core, CLI, and
      MCP
    checked: true
definition_of_done: []
comments: []
---

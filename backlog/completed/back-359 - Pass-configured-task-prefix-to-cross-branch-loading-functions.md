---
task_schema_version: 2
id: BACK-359
title: Pass configured task prefix to cross-branch loading functions
status: Done
assignee:
  - '@codex'
created_date: '2026-01-15 19:30'
updated_date: '2026-01-15 19:32'
labels:
  - bug
  - cross-branch
  - prefix-config
dependencies: []
priority: high
description: >-
  ### Why

  After renaming tasks from `task-` to `back-` prefix, the multi-branch search
  still finds old `task-` prefixed files from other branches. This is because
  cross-branch loading functions default to the hardcoded `"task"` prefix
  instead of using the configured prefix from `config.prefixes.task`.


  ### What

  Update all cross-branch task loading functions to pass the configured prefix
  from `userConfig.prefixes.task` instead of relying on the default `"task"`
  value.


  ### Affected Call Sites

  1. `task-loader.ts:510` - `loadRemoteTasks` → `buildRemoteTaskIndex` (missing
  prefix)

  2. `task-loader.ts:632` - `loadLocalBranchTasks` → `buildLocalBranchTaskIndex`
  (missing prefix)

  3. `backlog.ts:310` - `loadTaskById` → `findTaskInLocalBranches` (missing
  prefix)

  4. `backlog.ts:322` - `loadTaskById` → `findTaskInRemoteBranches` (missing
  prefix)


  ### Related

  - Parent task: back-345 (Configurable ID prefix system)
implementation_notes: >-
  ## Implementation Summary


  ### Changes Made


  1. **`src/core/task-loader.ts`**:
     - `loadRemoteTasks()` (line 510): Now passes `userConfig?.prefixes?.task ?? DEFAULT_TASK_PREFIX` to `buildRemoteTaskIndex()`
     - `loadLocalBranchTasks()` (line 634): Now passes `userConfig?.prefixes?.task ?? DEFAULT_TASK_PREFIX` to `buildLocalBranchTaskIndex()`

  2. **`src/core/backlog.ts`**:
     - `loadTaskById()` (lines 310, 322): Now passes `config?.prefixes?.task ?? "task"` to both `findTaskInLocalBranches()` and `findTaskInRemoteBranches()`

  ### Root Cause


  The cross-branch loading functions already had a `prefix` parameter that
  defaulted to `"task"`, but the callers were not passing the configured prefix
  from `config.prefixes.task`. This caused cross-branch search to always look
  for `task-*.md` files regardless of the configured prefix.


  ### Verification


  - TypeScript compiles without errors

  - Biome lint/format passes

  - All 400+ tests pass
acceptance_criteria:
  - index: 1
    text: loadRemoteTasks passes config prefix to buildRemoteTaskIndex
    checked: true
  - index: 2
    text: loadLocalBranchTasks passes config prefix to buildLocalBranchTaskIndex
    checked: true
  - index: 3
    text: loadTaskById passes config prefix to findTaskInLocalBranches
    checked: true
  - index: 4
    text: loadTaskById passes config prefix to findTaskInRemoteBranches
    checked: true
  - index: 5
    text: Cross-branch search only finds files matching configured prefix
    checked: true
  - index: 6
    text: All existing tests pass
    checked: true
definition_of_done: []
comments: []
---

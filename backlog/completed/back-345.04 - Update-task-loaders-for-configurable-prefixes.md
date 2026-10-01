---
task_schema_version: 2
id: BACK-345.04
title: Update task loaders for configurable prefixes
status: Done
assignee:
  - '@codex'
created_date: '2026-01-03 20:43'
updated_date: '2026-01-05 12:02'
labels:
  - enhancement
  - refactor
  - task-loader
dependencies:
  - task-345.01
parent_task_id: task-345
priority: medium
description: >-
  ### Overview

  Update task loaders (remote, local branch, cross-branch) to use configurable
  prefix patterns.


  ### Key Files

  - `src/core/task-loader.ts` - findTaskInRemoteBranches,
  findTaskInLocalBranches, loadRemoteTasks, buildRemoteTaskIndex,
  buildLocalBranchTaskIndex

  - `src/core/cross-branch-tasks.ts` - Various regex patterns


  ### Implementation

  1. Replace hardcoded `task-(\d+)` regex with `buildIdRegex(prefix)`

  2. Update `findTaskInRemoteBranches()` to use prefix config

  3. Update `findTaskInLocalBranches()` to use prefix config

  4. Update `loadRemoteTasks()` to use prefix config

  5. Update `buildRemoteTaskIndex()` to use prefix config

  6. Update `buildLocalBranchTaskIndex()` to use prefix config

  7. Update cross-branch task filename matching


  ### Tests (in same PR)

  - Test remote task loading with custom prefix

  - Test local branch task discovery with custom prefix

  - Test cross-branch operations

  - Verify existing tests still pass (backward compat)


  ### Docs (in same PR)

  - Document how prefix affects cross-branch task discovery
implementation_notes: |-
  ## Session 3 Implementation Notes (2026-01-05)

  ### Changes Made

  1. **task-loader.ts**:
     - Added `buildPathIdRegex` helper (no ^ anchor) for matching IDs in file paths
     - Updated `buildRemoteTaskIndex()` with optional `prefix` parameter
     - Updated `buildLocalBranchTaskIndex()` with optional `prefix` parameter
     - Updated `findTaskInRemoteBranches()` with `prefix` parameter
     - Updated `findTaskInLocalBranches()` with `prefix` parameter
     - All functions construct IDs in lowercase format (matches filename convention)

  2. **cross-branch-tasks.ts**:
     - Added `prefix` option to `getLatestTaskStatesForIds()`
     - Updated both file-to-ID mapping loops to use `buildPathIdRegex`
     - Lookup normalization uses lowercase format for consistency

  3. **prefix-config.ts**:
     - Added new `buildPathIdRegex()` function - regex without ^ anchor for path matching
     - Existing `buildIdRegex()` kept unchanged (uses ^ for ID validation)

  ### Key Design Decisions
  - Index stores lowercase IDs (e.g., `task-3`) to match filename convention
  - `buildPathIdRegex` doesn't use ^ anchor so it can find IDs anywhere in paths
  - Lookup functions normalize input to lowercase for consistent map access
  - All existing tests pass without modification
acceptance_criteria:
  - index: 1
    text: findTaskInRemoteBranches uses configured prefix
    checked: true
  - index: 2
    text: findTaskInLocalBranches uses configured prefix
    checked: true
  - index: 3
    text: loadRemoteTasks extracts IDs using configured prefix
    checked: true
  - index: 4
    text: buildRemoteTaskIndex uses configured prefix pattern
    checked: true
  - index: 5
    text: buildLocalBranchTaskIndex uses configured prefix pattern
    checked: true
  - index: 6
    text: Cross-branch task matching uses configured prefix
    checked: true
  - index: 7
    text: Tests verify task loading with custom prefixes
    checked: true
definition_of_done: []
comments: []
---

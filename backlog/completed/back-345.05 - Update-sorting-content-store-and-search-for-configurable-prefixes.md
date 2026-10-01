---
task_schema_version: 2
id: BACK-345.05
title: 'Update sorting, content store, and search for configurable prefixes'
status: Done
assignee:
  - '@codex'
created_date: '2026-01-03 20:43'
updated_date: '2026-01-05 12:07'
labels:
  - enhancement
  - refactor
  - search
dependencies:
  - task-345.01
parent_task_id: task-345
priority: medium
description: >-
  ### Overview

  Update task sorting, content store filtering, and search services to handle
  configurable prefixes.


  ### Key Files

  - `src/utils/task-sorting.ts` - parseTaskId, compareTaskIds, sortByTaskId

  - `src/core/content-store.ts` - File filtering logic

  - `src/core/search-service.ts` - TASK_ID_PREFIX constant

  - `src/utils/task-search.ts` - TASK_ID_PREFIX constant

  - `src/server/index.ts` - TASK_ID_PREFIX constant


  ### Implementation

  1. Update `parseTaskId()` to strip any configured prefix

  2. Update `sortByTaskId()` to work with any prefix

  3. Update content store file filtering to use configured prefix

  4. Replace TASK_ID_PREFIX constants with config-based approach

  5. Update search ID matching to use configured prefix


  ### Tests (in same PR)

  - Test sorting with custom prefixes (JIRA-1, JIRA-2, JIRA-10)

  - Test content store filters correct files

  - Test search finds tasks with custom prefixes


  ### Docs (in same PR)

  - Document sorting behavior with custom prefixes
implementation_notes: |-
  ## Session 3 Implementation Notes (2026-01-05)

  ### Changes Made

  1. **task-sorting.ts**:
     - Updated `parseTaskId()` to use generic prefix pattern `/^[a-zA-Z]+-/i`
     - Works with any prefix (task-, draft-, JIRA-, etc.)

  2. **content-store.ts**:
     - Updated task watcher file filter to use `/^[a-zA-Z]+-/` pattern
     - Accepts any prefix-style filenames in tasks directory

  3. **task-search.ts**:
     - Replaced `TASK_ID_PREFIX` constant with generic `PREFIX_PATTERN`
     - Added `extractPrefix()` and `stripPrefix()` helpers
     - Updated `createTaskIdVariants()` to be prefix-agnostic
     - Updated `parseTaskIdSegments()` to strip any prefix

  4. **search-service.ts**:
     - Same updates as task-search.ts
     - Prefix-agnostic ID variant generation

  5. **server/index.ts**:
     - Replaced `TASK_ID_PREFIX` with `PREFIX_PATTERN` and `DEFAULT_PREFIX`
     - Added `stripPrefix()` and `ensurePrefix()` helpers
     - Updated `findTaskByLooseId()` to use case-insensitive matching
     - All ID normalization now prefix-agnostic

  ### Key Design Decisions
  - Generic prefix pattern `/^[a-zA-Z]+-/i` matches any letters-dash prefix
  - Functions are now prefix-agnostic - they work with any prefix
  - Default prefix remains "task-" for backward compatibility
  - Case-insensitive matching for better ID lookup
acceptance_criteria:
  - index: 1
    text: parseTaskId strips any configured prefix correctly
    checked: true
  - index: 2
    text: sortByTaskId sorts custom-prefixed IDs numerically (JIRA-2 before JIRA-10)
    checked: true
  - index: 3
    text: Content store filters files using configured prefix
    checked: true
  - index: 4
    text: Search service uses configured prefix for ID matching
    checked: true
  - index: 5
    text: TASK_ID_PREFIX constants replaced with config-based approach
    checked: true
  - index: 6
    text: Tests verify sorting and search with custom prefixes
    checked: true
definition_of_done: []
comments: []
---

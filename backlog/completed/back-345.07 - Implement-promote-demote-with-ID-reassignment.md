---
task_schema_version: 2
id: BACK-345.07
title: Implement promote/demote with ID reassignment
status: Done
assignee:
  - '@codex'
created_date: '2026-01-03 20:43'
updated_date: '2026-01-05 12:33'
labels:
  - enhancement
  - drafts
dependencies:
  - task-345.02
  - task-345.03
parent_task_id: task-345
priority: high
description: >-
  ### Overview

  Update promote/demote operations to reassign IDs when moving between draft and
  task states.


  ### Key Files

  - `src/file-system/operations.ts` - promoteDraft, demoteTask

  - `src/core/backlog.ts` - promoteDraft, demoteTask methods


  ### Implementation

  1. Update `promoteDraft()` to:
     - Generate new task- ID using generateNextId()
     - Update task.id in content
     - Save with new task- filename
     - Delete old draft- file
  2. Update `demoteTask()` to:
     - Generate new draft- ID using generateNextDraftId()
     - Update task.id in content
     - Save with new draft- filename
     - Delete old task- file
  3. Handle edge cases (ID conflicts, file rename failures)


  ### Tests (in same PR)

  - Test promoteDraft changes draft-N to task-M

  - Test demoteTask changes task-N to draft-M

  - Test ID sequence continuity after promote/demote

  - Test file cleanup after operations


  ### Docs (in same PR)

  - Document ID reassignment behavior

  - Add examples in CLI help text
acceptance_criteria:
  - index: 1
    text: promoteDraft generates new task- ID (not keeping draft- ID)
    checked: false
  - index: 2
    text: demoteTask generates new draft- ID (not keeping task- ID)
    checked: false
  - index: 3
    text: Old files are properly deleted after promote/demote
    checked: false
  - index: 4
    text: 'ID sequences remain consistent (no gaps, no conflicts)'
    checked: false
  - index: 5
    text: Tests verify ID reassignment on promote
    checked: false
  - index: 6
    text: Tests verify ID reassignment on demote
    checked: false
  - index: 7
    text: Documentation explains ID reassignment behavior
    checked: false
definition_of_done: []
comments: []
---

---
task_schema_version: 2
id: BACK-241
title: Consolidate assignee normalization into helper
status: Done
assignee:
  - '@codex'
created_date: '2025-08-23 20:42'
updated_date: '2025-08-26 20:31'
labels: []
dependencies: []
description: >-
  Normalization of the `assignee` field from string to array is duplicated
  across `Core.createTask`, `Core.createDraft`, and `Core.updateTask`.
  Consolidate this logic into a single helper function or centralize it during
  YAML handling to avoid divergence and ensure consistent behavior across
  create/update paths.


  Notes:

  - The markdown parser already normalizes `assignee` on read. This task focuses
  on removing write-time duplication and ensuring symmetry between read/write
  paths.

  - Prefer a single, reusable normalization utility in Core or a shared util to
  reduce future drift.
implementation_notes: >-
  Introduced normalizeAssignee helper and used it across Core.createTask,
  Core.createDraft, Core.updateTask and during serialization to ensure symmetry.
  Added tests validating string and array assignee inputs on create/update
  paths.
acceptance_criteria:
  - index: 1
    text: >-
      Introduce helper to normalize `assignee` (string→array) or handle it
      during YAML parsing/serialization.
    checked: true
  - index: 2
    text: >-
      Replace duplicated normalization in `Core.createTask`, `Core.createDraft`,
      and `Core.updateTask` with the helper.
    checked: true
  - index: 3
    text: >-
      Tests cover task creation, draft creation, and task updates with both
      string and array `assignee` inputs.
    checked: true
definition_of_done: []
comments: []
---

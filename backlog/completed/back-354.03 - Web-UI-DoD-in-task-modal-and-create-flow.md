---
task_schema_version: 2
id: BACK-354.03
title: 'Web UI: DoD in task modal and create flow'
status: Done
assignee:
  - '@codex'
created_date: '2025-12-28 20:34'
updated_date: '2026-01-17 21:58'
labels: []
dependencies:
  - task-354.01
  - task-354.05
parent_task_id: BACK-354
description: >-
  Add a Definition of Done checklist section to the task modal and allow
  per-task overrides during creation.
implementation_plan: >-
  1) Reuse AcceptanceCriteriaEditor to render DoD section below AC in task
  modal.

  2) Implement create flow with DoD defaults prefill; allow
  add/remove/check/uncheck and disable defaults (clear).

  3) Map DoD changes to API payloads for create/edit; ensure persistence via
  server handlers.

  4) Add/adjust tests or document manual verification steps for the UI.
implementation_notes: >-
  Manual verification: set DoD defaults in Settings, open task create modal to
  confirm defaults prefill, add/remove items and clear defaults, create task,
  reopen to confirm DoD persists and toggles update.
acceptance_criteria:
  - index: 1
    text: >-
      Task modal shows a distinct DoD checklist section with checkboxes,
      separate from acceptance criteria.
    checked: true
  - index: 2
    text: >-
      Create flow pre-fills DoD defaults and lets users replace, append, or
      clear the checklist before saving.
    checked: true
  - index: 3
    text: DoD checklist persists through create and edit via the web API.
    checked: true
  - index: 4
    text: >-
      DoD section presentation is readable and aligned with the existing modal
      layout.
    checked: true
  - index: 5
    text: >-
      UI verification is covered by existing automated tests or documented
      manual steps for this change.
    checked: true
definition_of_done: []
comments: []
---

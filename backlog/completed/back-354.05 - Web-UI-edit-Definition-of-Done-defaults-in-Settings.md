---
task_schema_version: 2
id: BACK-354.05
title: 'Web UI: edit Definition of Done defaults in Settings'
status: Done
assignee:
  - '@codex'
created_date: '2025-12-28 20:49'
updated_date: '2026-01-17 21:58'
labels: []
dependencies:
  - task-354.01
parent_task_id: BACK-354
description: >-
  Add UI controls in the Settings page to view and update the project Definition
  of Done defaults stored in config.
implementation_plan: >-
  1) Add Definition of Done defaults list in Settings with add/remove and order
  preserved.

  2) Save via /api/config; cancel resets to loaded defaults.

  3) Note manual verification steps (save, reload, confirm persistence).
implementation_notes: >-
  Manual verification: update DoD defaults in Settings, Save, reload page to
  confirm persistence and order, then Cancel to verify reset behavior.
acceptance_criteria:
  - index: 1
    text: >-
      Settings page displays the current `definition_of_done` list with editable
      items and add/remove controls.
    checked: true
  - index: 2
    text: >-
      Saving settings persists updated `definition_of_done` to config via the
      existing `/api/config` endpoint.
    checked: true
  - index: 3
    text: >-
      Canceling settings restores the previously loaded DoD list without saving
      changes.
    checked: true
  - index: 4
    text: Order of DoD items is preserved as shown in the UI when saved.
    checked: true
  - index: 5
    text: >-
      Manual verification steps are noted (save, reload, confirm new items
      persist).
    checked: true
definition_of_done: []
comments: []
---

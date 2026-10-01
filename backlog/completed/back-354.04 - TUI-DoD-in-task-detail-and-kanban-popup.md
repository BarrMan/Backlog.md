---
task_schema_version: 2
id: BACK-354.04
title: 'TUI: DoD in task detail and kanban popup'
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
  Show the Definition of Done checklist in TUI task detail views and kanban
  popups.
implementation_plan: |-
  1) Render Definition of Done checklist in TUI task detail view.
  2) Render DoD section in kanban task popup, aligned with AC formatting.
  3) Update any TUI render/snapshot tests or document manual verification.
acceptance_criteria:
  - index: 1
    text: >-
      TUI task detail view shows a DoD checklist section with checked/unchecked
      items.
    checked: true
  - index: 2
    text: TUI kanban task popup includes a DoD section in a readable format.
    checked: true
  - index: 3
    text: >-
      DoD rendering is consistent with acceptance criteria presentation when
      both exist.
    checked: true
  - index: 4
    text: Any existing TUI rendering tests are updated to cover the DoD section.
    checked: true
definition_of_done: []
comments: []
---

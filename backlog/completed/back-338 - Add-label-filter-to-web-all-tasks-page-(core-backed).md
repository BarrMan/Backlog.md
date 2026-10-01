---
task_schema_version: 2
id: BACK-338
title: Add label filter to web all-tasks page (core-backed)
status: Done
assignee:
  - '@codex'
created_date: '2025-12-07 15:44'
updated_date: '2025-12-07 15:57'
labels: []
dependencies: []
priority: medium
description: >-
  Add a labels filter to the web All Tasks page, wiring it through core so no
  filtering logic lives in React/server handlers. Extend core task
  filtering/search to support labels, expose the filter through the HTTP API,
  and have the web UI call into that behavior for both initial list and filtered
  searches.
implementation_notes: >-
  Implemented label filters end-to-end for the web All Tasks page. Added
  label-aware filtering in core/queryTasks; HTTP list/search endpoints accept
  labels; web client API passes labels; web TaskList renders labels multi-select
  with URL sync and uses API-backed filtering.
acceptance_criteria:
  - index: 1
    text: >-
      Core task filtering supports a labels filter (including normalization) and
      is reused by search/task queries; no duplicate UI-only filtering logic.
    checked: true
  - index: 2
    text: >-
      HTTP API endpoints for listing/searching tasks accept label filters and
      pass them through to core; server code does not implement its own
      filtering.
    checked: true
  - index: 3
    text: >-
      Web All Tasks page surfaces a labels filter control and uses the
      API/core-backed filter for results (including URL sync).
    checked: true
  - index: 4
    text: >-
      Labels filter works alongside existing filters (status, priority, search)
      without breaking parent validation or cross-branch behavior.
    checked: true
definition_of_done: []
comments: []
---

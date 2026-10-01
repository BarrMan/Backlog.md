---
task_schema_version: 2
id: BACK-260
title: 'Web UI: Include completed records in All Tasks'
status: To Do
assignee:
  - '@codex'
created_date: '2025-09-07 19:42'
updated_date: '2026-07-30 17:10'
labels:
  - web-ui
  - filters
  - ui
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/825'
priority: medium
description: >-
  Extend the existing All Tasks page so completed work remains discoverable
  after the canonical completion or cleanup workflow moves it into
  backlog/completed.


  Completed-directory tasks are hidden by default to keep the normal task list
  focused. An explicit Include completed filter lets users add those records to
  All Tasks, where existing filters continue to narrow the combined results.
  This source filter is distinct from task status: active tasks with the
  terminal status remain active tasks, while completed means the record is
  stored in backlog/completed.


  Browser search must find completed-directory tasks by ID or keyword and open
  their existing task details. The active Kanban board remains unchanged, and
  records in backlog/archive/tasks are excluded.


  This task does not add multi-status selection, which remains owned by
  BACK-424.
acceptance_criteria:
  - index: 1
    text: All Tasks hides records from backlog/completed by default.
    checked: false
  - index: 2
    text: >-
      All Tasks provides an explicit Include completed filter that, when
      enabled, adds completed-directory records to the active task results.
    checked: false
  - index: 3
    text: >-
      The filter distinguishes storage source from configured status: active
      terminal-status tasks remain visible under normal active-task and
      status-filter behavior, while only records from backlog/completed are
      controlled by Include completed.
    checked: false
  - index: 4
    text: Records from backlog/archive/tasks are never included by this filter.
    checked: false
  - index: 5
    text: >-
      Existing status, excluded-status, priority, milestone, and label filters
      apply consistently to the combined active and completed result set.
    checked: false
  - index: 6
    text: >-
      The Include completed state is represented in URL query parameters,
      restores on reload and browser navigation, and combines without discarding
      other active filter parameters.
    checked: false
  - index: 7
    text: >-
      Clearing filters restores the default state with completed-directory tasks
      hidden.
    checked: false
  - index: 8
    text: >-
      Browser search by task ID or keyword includes matching completed-directory
      tasks even when All Tasks is using its default hidden state.
    checked: false
  - index: 9
    text: >-
      Selecting a completed task from All Tasks or browser search opens its
      existing task details through the current task-detail route, including
      after direct URL reload.
    checked: false
  - index: 10
    text: >-
      The Kanban board continues to exclude completed-directory tasks by
      default.
    checked: false
  - index: 11
    text: >-
      Empty, loading, and error states remain understandable when completed
      records are included.
    checked: false
  - index: 12
    text: >-
      Tests cover default hiding, enabling and clearing the filter, URL
      restoration, interaction with existing filters, completed-task search,
      archive exclusion, and unchanged board behavior.
    checked: false
definition_of_done: []
comments: []
---

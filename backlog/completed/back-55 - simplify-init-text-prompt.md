---
task_schema_version: 2
id: BACK-55
title: 'CLI: simplify init text prompt'
status: Done
assignee:
  - '@codex'
created_date: '2025-06-13'
updated_date: '2025-06-13'
labels:
  - bug
dependencies: []
parent_task_id: task-54
description: >-
  Users report that the current blessed-based input box used during `backlog
  init` renders poorly. Typed text is invisible on some terminals and a stray
  bar appears in the middle of the screen. The prompt should be simplified so it
  always displays correctly.
implementation_notes: >-
  Simplified `promptText` to always use readline. This avoids blessed layout
  issues while keeping multi-select and list UIs unchanged.
acceptance_criteria:
  - index: 1
    text: '`backlog init` asks for the project name using a plain readline prompt'
    checked: true
  - index: 2
    text: Other TUI functions remain unchanged
    checked: true
  - index: 3
    text: All tests pass
    checked: true
definition_of_done: []
comments: []
---

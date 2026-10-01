---
task_schema_version: 2
id: BACK-74
title: Fix TUI crash on Windows by disabling blessed tput
status: Done
assignee:
  - '@codex'
created_date: '2025-06-15'
updated_date: '2025-06-15'
labels:
  - bug
  - windows
dependencies: []
description: >-
  Windows builds fail when board view tries to load built-in terminfo.
  Initialize blessed program with tput:false
implementation_notes: >-
  - Wrap screen initialization in helper to reuse across modules

  - UPDATE: With the migration to bblessed (github:context-labs/bblessed), this
  issue is better handled as bblessed is optimized for Bun and cross-platform
  compatibility
acceptance_criteria:
  - index: 1
    text: >-
      All TUI screens create a program with `{ tput: false }` and pass it to
      `blessed.screen()`
    checked: true
  - index: 2
    text: Windows binary runs `backlog board view` without ENOENT or isAlt errors
    checked: true
  - index: 3
    text: Tests updated to reflect new initialization
    checked: true
definition_of_done: []
comments: []
---

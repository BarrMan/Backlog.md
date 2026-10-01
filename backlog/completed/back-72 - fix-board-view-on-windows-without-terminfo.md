---
task_schema_version: 2
id: BACK-72
title: Fix board view on Windows without terminfo
status: Done
assignee: []
created_date: '2025-06-15'
updated_date: '2025-06-16'
labels:
  - bug
  - windows
dependencies: []
description: >-
  `backlog board view` fails on Windows with an error similar to:

  ```

  ENOENT: no such file or directory, open
  'C:\a\Backlog.md\Backlog.md\node_modules\blessed\usr\xterm'

  ```

  The compiled CLI looks for blessed's terminfo files relative to the build
  path. When installed globally, this path does not exist. Disable blessed's
  Tput initialization by passing `tput: false` when creating screens so board
  and other UI screens work without terminfo files.
implementation_notes: >-
  - Disabled `Tput` in every screen creation to avoid missing terminfo files on
  Windows.

  - Updated `line-wrapping.test.ts` to pass `{ tput: false }` when creating
  screens.

  - Verified the board view works on Windows without ENOENT errors.

  - UPDATE: The migration to bblessed (github:context-labs/bblessed) provides
  better cross-platform support and eliminates the need for terminfo patches
  entirely.
acceptance_criteria:
  - index: 1
    text: 'All `blessed.screen` calls use `{ tput: false }`'
    checked: true
  - index: 2
    text: Windows build runs `backlog board view` without ENOENT errors
    checked: true
  - index: 3
    text: Tests updated and passing
    checked: true
definition_of_done: []
comments: []
---

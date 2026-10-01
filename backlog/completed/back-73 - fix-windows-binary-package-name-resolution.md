---
task_schema_version: 2
id: BACK-73
title: Fix Windows binary package name resolution
status: Done
assignee:
  - '@codex'
created_date: '2025-06-15'
updated_date: '2025-06-15'
labels:
  - bug
  - windows
  - packaging
dependencies: []
description: >-
  `backlog board view` fails on Windows with:

  ```

  Binary package not installed for win32-x64.

  ```

  The CLI wrapper computes the package name using `process.platform` directly,
  producing `backlog.md-win32-x64`. However the published package for Windows is
  `backlog.md-windows-x64`. Add a mapping so Windows uses the correct package
  name.
implementation_notes: |-
  - Added resolveBinary.cjs to map win32 to windows and exported helpers
  - Updated cli.cjs to use resolveBinaryPath for selecting binary
  - Modified release workflow to package resolveBinary.cjs
  - Created unit tests for getPackageName mapping
acceptance_criteria:
  - index: 1
    text: >-
      CLI resolves `backlog.md-windows-x64` on Windows and spawns the binary
      successfully.
    checked: true
  - index: 2
    text: Tests cover the platform mapping logic.
    checked: true
  - index: 3
    text: Release workflow includes any new script files.
    checked: true
definition_of_done: []
comments: []
---

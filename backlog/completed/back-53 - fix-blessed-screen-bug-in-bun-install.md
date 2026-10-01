---
task_schema_version: 2
id: BACK-53
title: Fix blessed screen bug in Bun install
status: Done
assignee:
  - '@codex'
created_date: '2025-06-13'
updated_date: '2025-06-13'
labels:
  - bug
dependencies: []
description: |-
  Global install via `bun add -g backlog.md` results in a runtime error:
  `TypeError: blessed.screen is not a function`. The init command fails
  because the optional blessed dependency does not load correctly when the
  CLI is executed with Bun.
implementation_notes: >-
  Fixed loadBlessed() to prefer dynamic import which works under Bun.

  Updated README with note about Bun global install.

  Added regression test for blessed prompt (line-wrapping).


  ### Update:

  The migration to bblessed (github:context-labs/bblessed) further improves Bun
  compatibility as it's specifically designed for Bun's runtime and module
  system.
acceptance_criteria:
  - index: 1
    text: >-
      Installing the package globally with Bun runs `backlog init` without
      errors
    checked: true
  - index: 2
    text: Tests cover Bun execution path for loading blessed
    checked: true
  - index: 3
    text: Documentation explains Bun global install support
    checked: true
definition_of_done: []
comments: []
---

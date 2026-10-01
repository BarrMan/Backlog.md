---
task_schema_version: 2
id: BACK-268
title: Show agent instruction version status
status: To Do
assignee:
  - '@codex'
created_date: '2025-09-17 19:19'
labels: []
dependencies: []
description: >-
  Expose tooling so users can see whether their local agent instruction files
  match the embedded reference version. Core should read the marker we embed,
  compare local vs bundled, and surface the result so future UX (nudges) can
  build on it.
implementation_plan: >-
  1. Decide where to surface comparison (new agents subcommand or flag on
  existing update command).

  2. Read version from bundled instructions and from existing task files.

  3. Implement comparison + status reporting structure.

  4. Cover edge cases (missing file, unknown format) with tests.
acceptance_criteria:
  - index: 1
    text: >-
      Command or subcommand reports local vs bundled version for each agent
      instruction type
    checked: false
  - index: 2
    text: Handles missing or legacy files without version markers gracefully
    checked: false
  - index: 3
    text: 'Unit/integration tests cover up-to-date, outdated, and missing scenarios'
    checked: false
definition_of_done: []
comments: []
---

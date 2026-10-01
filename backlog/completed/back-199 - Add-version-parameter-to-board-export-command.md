---
task_schema_version: 2
id: BACK-199
title: Add version parameter to board export command
status: Done
assignee: []
created_date: '2025-07-22'
labels: []
dependencies: []
description: >-
  Enable users to include custom version strings when exporting Kanban boards.
  This allows for better versioning in exports and enables the release workflow
  to include the actual version number in README updates.
implementation_notes: >-
  Implemented --export-version option for the board export command. Used this
  parameter name to avoid conflict with commander.js built-in --version flag.
  The version string is passed as-is without modification, allowing users to use
  any format they prefer. Updated release workflow to use this new parameter.
  Also updated README with examples showing various version formats.
acceptance_criteria:
  - index: 1
    text: Board export command accepts --export-version parameter
    checked: true
  - index: 2
    text: Version string is displayed in exported board header
    checked: true
  - index: 3
    text: Parameter accepts any custom string format
    checked: true
  - index: 4
    text: README documentation includes usage examples
    checked: true
definition_of_done: []
comments: []
---

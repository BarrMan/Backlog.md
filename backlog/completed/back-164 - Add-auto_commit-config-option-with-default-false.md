---
task_schema_version: 2
id: BACK-164
title: Add auto_commit config option with default false
status: Done
assignee: []
created_date: '2025-07-07'
updated_date: '2025-07-07'
labels:
  - enhancement
  - config
dependencies: []
description: >-
  Add configuration option to disable automatic git commits based on user
  feedback in issues #160 and #164. Users want control over their git history
  and commit conventions.
implementation_notes: >-
  Successfully implemented autoCommit configuration option with default false
  value.


  **Implementation Details:**

  - Added autoCommit field to BacklogConfig type definition

  - Updated config migration to include autoCommit with default false for
  existing projects

  - Modified Core class methods to check autoCommit config before performing git
  operations

  - Updated CLI commands to remove hardcoded autoCommit=true parameters

  - Added config command support for getting/setting autoCommit option

  - All git operations now respect the autoCommit setting from config


  **Files Modified:**

  - src/types/index.ts - Added autoCommit?: boolean to BacklogConfig

  - src/core/config-migration.ts - Added autoCommit: false to defaults and
  migration

  - src/core/backlog.ts - Added shouldAutoCommit() helper and updated all
  methods

  - src/cli.ts - Removed hardcoded autoCommit=true from CLI commands, added
  config support

  - src/file-system/operations.ts - Added autoCommit serialization and parsing


  **Usage:**

  - bun run cli config set autoCommit true/false

  - bun run cli config get autoCommit

  - bun run cli config list (shows autoCommit value)


  **Backward Compatibility:**

  - Existing projects will have autoCommit=false after migration

  - Project initialization still defaults to autoCommit=true for the init commit

  - All Core methods accept optional autoCommit parameter to override config
acceptance_criteria:
  - index: 1
    text: Add autoCommit field to BacklogConfig type definition
    checked: true
  - index: 2
    text: Update config schema migration to include autoCommit with default false
    checked: true
  - index: 3
    text: Modify Core class to respect autoCommit setting for all git operations
    checked: true
  - index: 4
    text: Update CLI commands to check autoCommit config before committing
    checked: true
  - index: 5
    text: Add config command support for setting autoCommit option
    checked: true
  - index: 6
    text: Update tests to verify autoCommit behavior works correctly
    checked: true
  - index: 7
    text: Add documentation for autoCommit configuration option
    checked: true
definition_of_done: []
comments: []
---

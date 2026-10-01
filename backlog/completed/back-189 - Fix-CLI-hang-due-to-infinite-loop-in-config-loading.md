---
task_schema_version: 2
id: BACK-189
title: Fix CLI hang due to infinite loop in config loading
status: Done
assignee: []
created_date: '2025-07-14'
updated_date: '2025-07-14'
labels:
  - bug
  - critical
  - config
dependencies: []
priority: high
description: >-
  The Backlog.md CLI becomes unresponsive when the backlogDirectory field is
  missing from config.yml. This critical issue occurs due to an infinite
  recursion in the configuration loading process, causing the CLI to repeatedly
  call configuration methods without resolution.
implementation_plan: |-
  1. Analyze the circular dependency in config loading
  2. Reproduce the issue with a test case
  3. Fix the circular dependency by avoiding saveConfig() in loadConfigDirect()
  4. Handle legacy .backlog directory migration
  5. Test the fix comprehensively
implementation_notes: >-
  Completely removed backlogDirectory configuration option and hardcoded
  'backlog' as the directory name. Fixed the original circular dependency issue
  by simplifying the configuration loading process. Added automatic migration
  from legacy .backlog directories to the standard backlog directory. All tests
  passing.
acceptance_criteria:
  - index: 1
    text: CLI does not hang when backlogDirectory is missing from config.yml
    checked: true
  - index: 2
    text: Configuration loading correctly handles missing backlogDirectory field
    checked: true
  - index: 3
    text: Default backlog directory is set when field is missing
    checked: true
  - index: 4
    text: No circular dependencies in configuration loading process
    checked: true
  - index: 5
    text: Tests cover the scenario of missing backlogDirectory
    checked: true
definition_of_done: []
comments: []
---

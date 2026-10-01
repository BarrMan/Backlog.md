---
task_schema_version: 2
id: BACK-84
title: Add -ac flag for acceptance criteria in task create/edit
status: Done
assignee:
  - '@claude'
created_date: '2025-06-18'
updated_date: '2025-06-19'
labels:
  - enhancement
  - cli
dependencies: []
description: >-
  Add acceptance criteria flag support to task creation and editing commands.
  Include -ac flag and consider full --acceptance-criteria command option.
implementation_notes: >-
  - Implemented both `--ac` and `--acceptance-criteria` flags for both create
  and edit commands

  - Used Commander.js convention where short flags must be single character, so
  used `--ac` as a long option

  - Acceptance criteria are comma-separated and automatically formatted as
  markdown checkboxes

  - The `updateTaskAcceptanceCriteria` function handles adding or replacing
  criteria in the task description

  - Added comprehensive test coverage including edge cases and both flags

  - The feature supports multiple criteria in a single flag value
  (comma-separated)
acceptance_criteria:
  - index: 1
    text: Add -ac flag to `backlog task create` command
    checked: true
  - index: 2
    text: 'Add -ac flag to `backlog task edit` command  '
    checked: true
  - index: 3
    text: Consider implementing full --acceptance-criteria flag as alternative
    checked: true
  - index: 4
    text: Acceptance criteria should be added as checkbox list in markdown
    checked: true
  - index: 5
    text: Preserve existing -d (description) functionality
    checked: true
  - index: 6
    text: Update help text for both create and edit commands
    checked: true
  - index: 7
    text: Add tests for acceptance criteria flag functionality
    checked: true
  - index: 8
    text: >-
      Handle multiple acceptance criteria items (comma-separated or multiple
      flags)
    checked: true
definition_of_done: []
comments: []
---

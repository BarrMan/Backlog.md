---
task_schema_version: 2
id: BACK-67
title: Add -p shorthand for --parent option in task create command
status: Done
assignee: []
created_date: '2025-06-15'
updated_date: '2025-06-15'
labels:
  - cli
  - enhancement
dependencies: []
description: >-
  Add support for using -p as a shorthand alias for --parent when creating
  tasks. This will improve the CLI usability by allowing users to specify parent
  tasks more quickly.
implementation_notes: >-
  - Added `-p` as a shorthand for `--parent` in the task create command
  (src/cli.ts:243)

  - The implementation was straightforward - simply updated the option
  definition to include both the shorthand and long form

  - Created comprehensive test suite in `src/test/cli-parent-shorthand.test.ts`
  that verifies:
    - The `-p` shorthand creates subtasks with the correct parent
    - Both `-p` and `--parent` produce identical results
    - The help text correctly displays the shorthand option
  - The test subtask (task-67.1) was successfully created using the new `-p`
  option to verify functionality
acceptance_criteria:
  - index: 1
    text: '`-p` option works as an alias for `--parent` in the `task create` command'
    checked: true
  - index: 2
    text: >-
      Both `backlog task create "Task title" -p task-5` and `backlog task create
      "Task title" --parent task-5` produce the same result
    checked: true
  - index: 3
    text: Help text shows `-p` as the shorthand for `--parent`
    checked: true
  - index: 4
    text: Existing `--parent` functionality remains unchanged
    checked: true
  - index: 5
    text: Tests are added to verify both options work correctly
    checked: true
definition_of_done: []
comments: []
---

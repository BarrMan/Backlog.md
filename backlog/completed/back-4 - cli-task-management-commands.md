---
completed_date: '2025-06-09'
task_schema_version: 2
id: BACK-4
title: 'CLI: Task Management Commands'
status: Done
assignee: []
reporter: '@MrLesk'
created_date: '2025-06-04'
updated_date: '2025-06-09'
labels:
  - cli
  - command
milestone: m-1
dependencies:
  - task-3
description: >-
  Implement comprehensive task management functionality including creation,
  listing, viewing, editing, and archiving of tasks and drafts. This encompasses
  all user-facing CLI commands for task lifecycle management.
implementation_notes: >-
  - Subtasks **task-4.1** through **task-4.13** introduced complete CLI support
  for task and draft management.

  - Commands include `task create`, `task list`, `task view`, `task edit`, `task
  archive`, `task demote`, and draft variants.

  - Tasks can be created as subtasks using the `--parent` option and moved
  between draft and active states.

  - Metadata updates such as status and labels persist correctly through the
  `edit` command.

  - Extensive tests and documentation were added in each subtask to ensure
  reliability.
acceptance_criteria: []
definition_of_done: []
comments: []
---

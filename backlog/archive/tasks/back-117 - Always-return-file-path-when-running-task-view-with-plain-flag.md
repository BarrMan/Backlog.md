---
task_schema_version: 2
id: BACK-117
title: Always return file path when running task view with --plain flag
status: To Do
assignee: []
created_date: '2025-07-06'
labels: []
dependencies: []
description: >-
  **ARCHIVED: Duplicate of task-101**


  When using 'backlog task <task-id> --plain', always include the file path in
  the output. This helps AI agents and automation scripts locate the actual task
  file for further processing or editing.


  This task was identified as a duplicate of task-101 which covers the same
  functionality with more comprehensive requirements. All requirements from this
  task have been merged into task-101.
acceptance_criteria:
  - index: 1
    text: Add file path to output when using `backlog task <task-id> --plain`
    checked: false
  - index: 2
    text: Ensure path is absolute and correctly formatted
    checked: false
  - index: 3
    text: Include path as the first line or clearly marked section
    checked: false
  - index: 4
    text: Maintain backward compatibility with existing plain output format
    checked: false
  - index: 5
    text: Test with various task IDs and file locations
    checked: false
definition_of_done: []
comments: []
---

---
task_schema_version: 2
id: BACK-172
title: Order tasks by status and ID in both web and CLI lists
status: To Do
assignee: []
created_date: '2025-07-12'
labels: []
dependencies: []
description: >-
  Update both the web UI task list and CLI task list command to order tasks by:

  1. Status ascending (To Do → In Progress → Done)

  2. Within each status group, order by task ID descending (newest first)


  This will provide consistent ordering across both interfaces and make it
  easier to find tasks by status priority.
acceptance_criteria:
  - index: 1
    text: 'Tasks are grouped and ordered by status: "To Do", "In Progress", "Done"'
    checked: false
  - index: 2
    text: 'Within each status, tasks are ordered by ID descending (newest first)'
    checked: false
  - index: 3
    text: Visual grouping or section headers show status groups clearly
    checked: false
  - index: 4
    text: Maintains current task card design and functionality
    checked: false
  - index: 5
    text: >-
      `bun run cli task list` orders tasks by status ascending, then ID
      descending
    checked: false
  - index: 6
    text: '`bun run cli task list --plain` also follows the same ordering'
    checked: false
  - index: 7
    text: Output clearly shows the ordering (status groups visible)
    checked: false
  - index: 8
    text: Maintains current CLI output format and information
    checked: false
  - index: 9
    text: Works with existing filtering options if any
    checked: false
definition_of_done: []
comments: []
---
## Acceptance Criteria
<!-- AC:BEGIN -->
### Web UI Task List

### CLI Task List
<!-- AC:END -->
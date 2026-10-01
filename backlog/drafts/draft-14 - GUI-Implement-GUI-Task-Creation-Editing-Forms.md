---
task_schema_version: 2
id: DRAFT-14
title: 'GUI: Implement GUI Task Creation/Editing Forms'
status: To Do
assignee: []
reporter: '@MrLesk'
created_date: '2025-06-04'
labels:
  - gui
milestone: M3 - GUI
dependencies:
  - task-8
description: >-
  Create forms/modals in the GUI for:


  - Creating new tasks (as active tasks or draft).

  - Editing existing tasks (all fields from frontmatter and description).

  - All operations should use the core logic library to update Markdown files
  and commit.
acceptance_criteria:
  - index: 1
    text: Task creation form works and saves new tasks.
    checked: false
  - index: 2
    text: Task editing form loads existing task data and saves changes.
    checked: false
definition_of_done: []
comments: []
---

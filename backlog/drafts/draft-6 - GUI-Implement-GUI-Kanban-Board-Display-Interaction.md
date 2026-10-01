---
task_schema_version: 2
id: DRAFT-6
title: 'GUI: Implement GUI Kanban Board Display & Interaction'
status: To Do
assignee: []
reporter: '@MrLesk'
created_date: '2025-06-04'
labels:
  - gui
  - kanban
  - feature
milestone: M4 - GUI-Kanban Board
dependencies:
  - task-8
description: >-
  Develop the main Kanban board view in the GUI:


  - Display columns based on task statuses.

  - Render task cards with key information.

  - Implement drag-and-drop to change task status (updating the Markdown file
  and committing).

  - Allow opening a task for detailed view/edit.
acceptance_criteria:
  - index: 1
    text: Kanban board accurately reflects tasks in `.backlog/tasks/`.
    checked: false
  - index: 2
    text: Task cards display relevant info.
    checked: false
  - index: 3
    text: Drag-and-drop updates task status and commits change.
    checked: false
definition_of_done: []
comments: []
---

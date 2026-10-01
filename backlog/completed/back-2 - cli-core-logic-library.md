---
task_schema_version: 2
id: BACK-2
title: 'CLI: Design & Implement Core Logic Library'
status: Done
assignee:
  - '@MrLesk'
reporter: '@MrLesk'
created_date: '2025-06-03'
labels:
  - cli
  - core-logic
  - architecture
milestone: m-1
dependencies:
  - task-1
description: |-
  Develop the central TypeScript library that handles:

  - File system operations within the `.backlog` directory.
  - Markdown parsing (reading frontmatter and content).
  - Markdown serialization (writing task files).
  - Basic Git interaction wrappers (e.g., add, commit specific files).
  - Defining data structures for tasks, docs, decisions.
acceptance_criteria:
  - index: 1
    text: Clear interface for file operations.
    checked: true
  - index: 2
    text: Robust Markdown parsing/serialization for Backlog task files.
    checked: true
  - index: 3
    text: >-
      Wrapper functions for essential Git commands (e.g., commit changes to a
      task file).
    checked: true
  - index: 4
    text: 'Core data models (Task, DecisionLog, Document) defined.'
    checked: true
definition_of_done: []
comments: []
---

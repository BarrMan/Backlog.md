---
task_schema_version: 2
id: BACK-20
title: Add agent guideline to mark tasks In Progress on start
status: Done
assignee: []
reporter: '@MrLesk'
created_date: '2025-06-09'
updated_date: '2025-06-09'
labels:
  - agents
dependencies: []
description: >-
  Update the AI agent guideline files to ensure that whenever an agent starts
  working on a task they immediately mark the task as **In Progress**, assign it
  to themselves, and push the change.
implementation_notes: >-
  * Added new guideline bullet in `AGENTS.md` instructing agents to set the task
  to `In Progress`, assign themselves, and push when beginning work.

  * Mirrored the same instruction in `CLAUDE.md:41` under **AI Agent
  Integration** section.

  * Updated `.cursorrules` within the Project-Specific Rules section to include
  the requirement.

  * All three files now consistently instruct agents to mark tasks as "In
  Progress" and assign themselves when starting work.

  * This ensures proper task tracking and prevents multiple agents from working
  on the same task simultaneously.

  * Implementation follows the established pattern of maintaining consistency
  across all agent instruction files.
acceptance_criteria:
  - index: 1
    text: >-
      `AGENTS.md` mentions setting status to `In Progress`, assigning the task,
      and pushing.
    checked: true
  - index: 2
    text: '`CLAUDE.md` mentions the same instruction.'
    checked: true
  - index: 3
    text: '`.cursorrules` mentions the same instruction.'
    checked: true
  - index: 4
    text: Task committed to repository.
    checked: true
definition_of_done: []
comments: []
---

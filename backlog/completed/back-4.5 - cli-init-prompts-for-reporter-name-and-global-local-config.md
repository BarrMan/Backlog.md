---
task_schema_version: 2
id: BACK-4.5
title: 'CLI: Init prompts for reporter name and global/local config'
status: Done
assignee:
  - '@MrLesk'
reporter: '@MrLesk'
created_date: '2025-06-08'
updated_date: '2025-06-08'
labels:
  - cli
  - config
milestone: m-1
dependencies:
  - task-3
parent_task_id: task-4
description: >-
  Enhance `backlog init` with interactive prompts:


  - Ask for a default **reporter** name for new tasks.

  - Prompt whether to store this configuration globally or only for the current
  repository.

  - When storing locally, create a hidden `.user` settings file and make sure it
  is ignored by Git.
acceptance_criteria:
  - index: 1
    text: Running `backlog init` asks for a default reporter name.
    checked: true
  - index: 2
    text: User can choose between storing the reporter setting globally or locally.
    checked: true
  - index: 3
    text: >-
      Choosing the local option creates a `.user` settings file and appends it
      to `.gitignore`.
    checked: true
  - index: 4
    text: Reporter name saved based on the chosen scope.
    checked: true
definition_of_done: []
comments: []
---

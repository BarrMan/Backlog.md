---
task_schema_version: 2
id: BACK-102.1
title: Add Copilot instructions file
status: To Do
assignee: []
created_date: '2025-06-26'
labels:
  - documentation
  - agents
dependencies:
  - task-102
description: >-
  Create a brief instructions document for GitHub Copilot users so that
  automated tools know how to interact with this project. The file should reside
  under `.github/copilot-instructions.md` and incorporate guidance from the
  canonical agent guidelines.
acceptance_criteria:
  - index: 1
    text: >-
      New file `.github/copilot-instructions.md` exists with guidance derived
      from `AGENT_GUIDELINES.md`.
    checked: false
  - index: 2
    text: Document mentions it is kept in sync with the canonical guidelines.
    checked: false
  - index: 3
    text: The file location is documented in repository README or appropriate docs.
    checked: false
definition_of_done: []
comments: []
---

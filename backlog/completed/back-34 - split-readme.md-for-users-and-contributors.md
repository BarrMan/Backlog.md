---
task_schema_version: 2
id: BACK-34
title: Split README.md for users and contributors
status: Done
assignee:
  - '@codex'
created_date: '2025-06-09'
labels:
  - docs
dependencies: []
description: >-
  Split the current README.md into two separate files: one focused on how to use
  the Backlog.md CLI, and another covering how to run the project locally for
  contributors.
implementation_notes: >-
  - Created `DEVELOPMENT.md` with instructions for running and testing the
  project locally.

  - Removed development sections from `README.md` and added a link to the new
  document.

  - Added reciprocal link back to `README.md` from `DEVELOPMENT.md`.
acceptance_criteria:
  - index: 1
    text: README for users explains how to install and use Backlog.md CLI
    checked: true
  - index: 2
    text: >-
      Separate documentation describes how to run the project locally for
      contributors
    checked: true
  - index: 3
    text: Both docs link to each other from the repository root
    checked: true
  - index: 4
    text: Task committed to repository
    checked: true
definition_of_done: []
comments: []
---

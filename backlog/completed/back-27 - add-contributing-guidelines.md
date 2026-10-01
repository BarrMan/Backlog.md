---
task_schema_version: 2
id: BACK-27
title: Add CONTRIBUTING guidelines
status: Done
assignee: []
created_date: '2025-06-09'
updated_date: '2025-06-09'
labels:
  - docs
  - github
dependencies: []
description: Create CONTRIBUTING.md with guidelines for contributing to Backlog.md.
implementation_notes: |-
  - Added `CONTRIBUTING.md` with sections on opening issues and submitting
    pull requests.
  - Documented test and lint commands (`bun test` and `npx biome check .`).
  - Linked to the new guidelines from `README.md`.
acceptance_criteria:
  - index: 1
    text: CONTRIBUTING.md explains how to open issues and PRs
    checked: true
  - index: 2
    text: Describes running tests and linting
    checked: true
  - index: 3
    text: Task committed to repository
    checked: true
definition_of_done: []
comments: []
---

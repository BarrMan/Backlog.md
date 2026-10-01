---
task_schema_version: 2
id: BACK-29
title: Add GitHub templates
status: Done
assignee: []
created_date: '2025-06-09'
updated_date: '2025-06-09'
labels:
  - github
  - docs
dependencies: []
description: Create issue and pull request templates under .github/.
implementation_notes: |-
  - Added `.github/ISSUE_TEMPLATE` with bug and feature request templates.
  - Created `PULL_REQUEST_TEMPLATE.md` requesting Backlog task references.
  - Documented templates in `README.md`.
acceptance_criteria:
  - index: 1
    text: Bug report and feature request templates added
    checked: true
  - index: 2
    text: Pull request template added referencing task IDs
    checked: true
  - index: 3
    text: Task committed to repository
    checked: true
definition_of_done: []
comments: []
---

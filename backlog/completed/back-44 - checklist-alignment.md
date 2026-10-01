---
task_schema_version: 2
id: BACK-44
title: Checklist alignment
status: Done
assignee: []
created_date: '2025-06-11'
updated_date: '2025-06-13'
labels:
  - ui
  - enhancement
dependencies: []
description: >-
  Goal: Make checkbox lists flush-left and tidy.


  Detailed work:

  - During markdown-to-UI transform, replace "- [x] " / "- [ ] " with " [x] " /
  " [ ] " (or another padding scheme you prefer)
acceptance_criteria:
  - index: 1
    text: All checklist lines start at the same column (snapshot diff)
    checked: true
  - index: 2
    text: Regex unit test passes for both checked and unchecked cases
    checked: true
definition_of_done: []
comments: []
---

---
task_schema_version: 2
id: BACK-51
title: Code-path styling
status: Done
assignee: []
created_date: '2025-06-11'
updated_date: '2025-06-13'
labels:
  - enhancement
dependencies: []
description: |-
  Goal: Make file paths stand out and easier to scan.

  Detailed work:
  - In the markdown transform, detect back-ticked paths like \.
  - Render them dim grey and place each on its own line if not already isolated.
acceptance_criteria:
  - index: 1
    text: Regex captures 100% of code paths in test fixture.
    checked: true
  - index: 2
    text: 'Visual diff shows dim-grey paths, separated from surrounding prose.'
    checked: true
definition_of_done: []
comments: []
---

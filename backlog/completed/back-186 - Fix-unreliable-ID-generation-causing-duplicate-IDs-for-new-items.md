---
task_schema_version: 2
id: BACK-186
title: Fix unreliable ID generation causing duplicate IDs for new items
status: Done
assignee:
  - '@mjgs'
created_date: '2025-07-13'
labels:
  - bug
  - critical
  - data-integrity
dependencies: []
priority: high
description: >-
  Previously, the ID generation for new tasks, documents, and decisions was
  unreliable due to incorrect file pattern matching. The logic depended on
  parsing existing filenames with overly broad patterns like '*.md' instead of
  specific patterns like 'task-*.md', 'doc-*.md', 'decision-*.md'. This caused
  new items to often be created with non-incremented IDs like 'task-1'
  repeatedly, breaking data integrity and unique identification.
implementation_notes: >-
  Root cause was broad file patterns in ID scanning logic that matched all
  markdown files including README.md. 


  Fixed by adopting proper ID normalization patterns and specific file patterns.
  Added E2E tests that verify real CLI workflows create properly incremented IDs
  (task-1 → task-2, doc-1 → doc-2, decision-1 → decision-2).  

  This fix prevents critical data integrity issues and ensures reliable unique
  identification throughout the system.
acceptance_criteria:
  - index: 1
    text: Fix loadDecision to use 'decision-*.md' pattern instead of '*.md'
    checked: true
  - index: 2
    text: >-
      Fix saveDocument to normalize ID by removing 'doc-' prefix before filename
      creation
    checked: true
  - index: 3
    text: Add comprehensive E2E tests for task/document/decision ID incrementing
    checked: true
  - index: 4
    text: Ensure ID generation scans only relevant files for each item type
    checked: true
  - index: 5
    text: >-
      Prevent duplicate IDs that could corrupt task relationships and
      dependencies
    checked: true
definition_of_done: []
comments: []
---

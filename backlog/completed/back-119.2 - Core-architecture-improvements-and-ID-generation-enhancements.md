---
task_schema_version: 2
id: BACK-119.2
title: Core architecture improvements and ID generation enhancements
status: Done
assignee: []
created_date: '2025-07-12'
labels: []
dependencies: []
parent_task_id: task-119
description: >-
  Enhanced core architecture with improved ID generation for documents and
  decisions, cross-branch collision detection, and better data flow between CLI
  and web components. These improvements were necessary for production
  robustness.
implementation_notes: >-
  These core architecture improvements were essential for preventing ID
  conflicts and ensuring data consistency across the application. The work
  included implementing cross-branch ID collision detection, improving the core
  API surface, and ensuring proper ID management throughout the system. While
  not explicitly required by the original tasks, these improvements were
  necessary for a robust, production-ready system.
acceptance_criteria:
  - index: 1
    text: Implement generateNextDocId with cross-branch collision detection
    checked: true
  - index: 2
    text: Implement generateNextDecisionId with cross-branch collision detection
    checked: true
  - index: 3
    text: Add createDocumentWithId method to core for ID management
    checked: true
  - index: 4
    text: Update createDecisionWithTitle to use improved ID generation
    checked: true
  - index: 5
    text: Enhance server-side ID management to prevent conflicts
    checked: true
  - index: 6
    text: Improve data flow consistency between CLI and web UI
    checked: true
  - index: 7
    text: Add proper ID normalization for decisions to prevent double-prefixing
    checked: true
  - index: 8
    text: Ensure robust ID generation across all components
    checked: true
definition_of_done: []
comments: []
---

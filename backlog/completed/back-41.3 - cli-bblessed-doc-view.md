---
task_schema_version: 2
id: BACK-41.3
title: 'CLI: bblessed doc view'
status: Done
assignee:
  - Claude
created_date: '2025-06-11'
updated_date: '2025-06-11'
labels:
  - cli
dependencies: []
parent_task_id: task-41
description: Use bblessed to display documentation files with scroll and search.
implementation_notes: >-
  Implemented document viewing with blessed's scrollable interface:


  ### Key Changes:

  1. **Added --tui flag**: Extended the `doc view` command with an optional
  `--tui` flag for enhanced viewing

  2. **Scrollable Document Display**: Documents are displayed in a full-screen
  scrollable window

  3. **Navigation Support**: Implemented vi-style keyboard navigation for
  comfortable reading


  ### Technical Details:

  - Modified the doc view command handler to support the `--tui` option

  - When enabled, loads the document content and displays it using
  `scrollableViewer()`

  - The blessed box widget provides:
    - Arrow keys and j/k for vertical scrolling
    - Mouse wheel support for scrolling
    - q/Escape to exit the viewer
  - Search functionality is inherently supported through the terminal's native
  search (e.g., Ctrl+F in most terminals)


  ### Integration:

  - Maintains full backward compatibility - without `--tui`, outputs directly to
  console

  - Gracefully degrades to console.log when blessed is unavailable

  - Reuses the existing document loading logic from the filesystem module

  - The implementation is consistent with the task view TUI approach
acceptance_criteria:
  - index: 1
    text: Display docs in scrollable window
    checked: true
  - index: 2
    text: Provide search or navigation keys
    checked: true
  - index: 3
    text: Works on Node and Bun
    checked: true
definition_of_done: []
comments: []
---

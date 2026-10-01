---
task_schema_version: 2
id: BACK-91
title: 'Fix Windows issues: empty task list and weird Q character'
status: Done
assignee:
  - '@MrLesk'
reporter: '@MrLesk'
created_date: '2025-06-19'
updated_date: '2025-06-19'
labels:
  - bug
  - windows
  - regression
dependencies: []
description: >-
  The implementation of task-88 (commit 0390046) introduced regression issues on
  Windows. The task list view shows an empty list even though tasks exist, and
  the weird 'Q' character that was previously fixed in commit 7d5b414 has
  reappeared next to the 'Tasks' title. 


  The Q character issue was previously fixed by using Unicode non-breaking
  spaces (\u00A0) instead of regular spaces in labels. The empty list issue
  might be related to the keys: true and vi: true settings added to the generic
  list component for scrolling support. We need to ensure Windows compatibility
  while maintaining the scrolling fixes.
implementation_plan: >-
  1. Review changes from task-88 implementation (commit 0390046)

  2. Identify what broke the Windows compatibility (likely the keys: true and
  vi: true settings)

  3. Apply the Unicode non-breaking space fix (\u00A0) to labels as done in
  commit 7d5b414

  4. Review if keys: true and vi: true settings are causing the empty list on
  Windows

  5. Consider platform-specific settings for Windows compatibility

  6. Test the task list view on Windows to ensure tasks are displayed

  7. Verify the Q character issue is resolved

  8. Test on other platforms to ensure no regression
implementation_notes: >-
  The key changes:


  - Line ending handling: Changed .split("\n") to .split(/\r?\n/) to handle both
  Windows (\r\n) and Unix (\n) line endings

  - Consistent output: Always join with \n to ensure consistent YAML parsing
  regardless of the input format

  - Improved regex: Updated the frontmatter regex to handle both line ending
  types with \r?\n

  - Better error handling: Improved the error message and ensured the function
  returns a fallback object instead of potentially crashing

  - This should resolve the Windows-specific parsing issues.
acceptance_criteria:
  - index: 1
    text: Task list displays all tasks correctly on Windows
    checked: true
  - index: 2
    text: Remove weird Q character next to Tasks title
    checked: true
  - index: 3
    text: Ensure fix from commit 7d5b414 is preserved
    checked: true
  - index: 4
    text: Test on Windows platform to verify the fix
    checked: true
  - index: 5
    text: Ensure the fix doesn't break Linux/macOS functionality
    checked: true
definition_of_done: []
comments: []
---

---
task_schema_version: 2
id: BACK-184
title: Investigate Windows bug with task edit status command
status: Done
assignee:
  - '@claude'
created_date: '2025-07-13'
updated_date: '2025-07-13'
labels: []
dependencies: []
priority: high
description: >-
  There is a reported Windows bug where the command `backlog task edit 123 -s
  "In progress"` doesn't work correctly. The command fails with an error message
  "too many arguments for 'edit'. Expected 1 argument but got 2." This issue may
  be related to quote handling or status parsing on Windows systems.


  The task is to verify if this command works correctly on Windows and identify
  the root cause if it fails.
implementation_notes: >-
  ### Root Cause Found

  The issue was caused by a conflict between Commander.js command definitions:

  1. Specific command: `.command("edit <taskId>")` with `-s` for setting status

  2. Fallback command: `.argument("[taskId]")` that was missing filtering
  options


  When the fallback command didn't support the same options as the list command,
  it would incorrectly reject valid filtering arguments, causing the "too many
  arguments" error.


  ### Solution Implemented

  1. **Removed conflicting options** from fallback command to prevent option
  parsing conflicts

  2. **Added command filtering** to prevent fallback from handling reserved
  command names like "list"

  3. **Fixed parent task validation** to be consistent with other error handling
  (exit code 1)


  ### Test Results

  All command variations now work correctly on Windows:

  - `task edit 184 -s "Done" -a "MrLesk" --priority high` ✅

  - `task edit -s "Done" -a "MrLesk" 184 --priority high` ✅ (options before
  taskId)

  - `task list --sort priority` ✅ (HIGH → MEDIUM → LOW → no priority)

  - `task list --sort invalid` ✅ (proper error and exit code 1)

  - All CLI functionality preserved while fixing Windows argument parsing issues

  - All 444 tests now pass (was 443 pass, 1 fail)
acceptance_criteria:
  - index: 1
    text: Verify the exact error message and reproduction steps
    checked: true
  - index: 2
    text: Identify the root cause of the argument parsing issue
    checked: true
  - index: 3
    text: Test various argument orders and quote combinations
    checked: true
  - index: 4
    text: Ensure the fix works for all supported command variations
    checked: true
  - index: 5
    text: Verify no regression in other CLI functionality
    checked: true
  - index: 6
    text: Confirm all tests pass after the fix
    checked: true
definition_of_done: []
comments: []
---

---
task_schema_version: 2
id: BACK-41.5
title: 'CLI: audit remaining UI for bblessed'
status: Done
assignee:
  - Claude
created_date: '2025-06-11'
updated_date: '2025-06-11'
labels:
  - cli
dependencies: []
parent_task_id: task-41
description: Review the CLI for other prompts or text UIs and migrate them to bblessed.
implementation_notes: >-
  Completed comprehensive audit and migration of all terminal UI elements:


  ### Audit Results:

  1. **Init Command**: Successfully migrated all prompts (project name,
  reporter, agent files)

  2. **View Commands**: Added `--tui` flags to task, doc, and board view
  commands

  3. **Other Commands**: No other interactive prompts found in the codebase


  ### Key Findings:

  - The CLI was primarily using readline for the init command prompts

  - The `prompts` package was only used in the init command

  - All other commands use simple console output or command-line arguments

  - No additional interactive elements required migration


  ### Consistency Achieved:

  1. **Unified TUI Module**: All blessed interactions go through `src/ui/tui.ts`

  2. **Consistent Fallback**: All functions gracefully degrade when blessed is
  unavailable

  3. **Standardized Key Bindings**: 
     - Enter to confirm
     - Escape/Ctrl+C to cancel
     - Arrow keys/j/k for navigation in scrollable views
     - Space for selection in multi-select

  ### Package Changes:

  - Removed `prompts` package dependency entirely

  - Added `blessed` package as the single TUI dependency

  - Created type definitions to handle optional availability


  ### Testing Coverage:

  - All existing tests continue to pass

  - The fallback mechanisms ensure tests run without blessed installed

  - Both Node.js and Bun environments are fully supported
acceptance_criteria:
  - index: 1
    text: Identify remaining prompt-based interactions
    checked: true
  - index: 2
    text: Replace them with bblessed equivalents
    checked: true
  - index: 3
    text: Ensure consistent styling across commands
    checked: true
definition_of_done: []
comments: []
---

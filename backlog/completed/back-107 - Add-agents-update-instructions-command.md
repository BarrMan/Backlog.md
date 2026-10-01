---
task_schema_version: 2
id: BACK-107
title: Add agents --update-instructions command
status: Done
assignee: []
created_date: '2025-07-03'
updated_date: '2025-07-04'
labels: []
dependencies: []
description: >-
  Add a new command 'backlog agents --update-instructions' that updates the
  project's agent instruction files (.cursorrules, CLAUDE.md, AGENTS.md,
  GEMINI.md, .github/copilot-instructions.md) with the latest versions embedded
  in the current Backlog CLI installation. This command follows the same pattern
  as 'backlog init' but only updates the agent-related files to ensure projects
  have up-to-date instructions for AI agents.
implementation_notes: >-
  **Approach taken:**

  - Added a new `agents` command group to the CLI with a `--update-instructions`
  flag

  - Reused the existing `addAgentInstructions` function from
  `agent-instructions.ts` to maintain consistency with the `backlog init`
  command

  - Used the same prompts pattern as the init command for file selection


  **Features implemented:**

  - `backlog agents --update-instructions` command that presents an interactive
  multiselect prompt

  - Support for all agent instruction files: .cursorrules, CLAUDE.md, AGENTS.md,
  GEMINI.md, .github/copilot-instructions.md

  - Proper error handling for non-backlog projects

  - Confirmation messages showing which files were updated

  - Graceful handling when no files are selected


  **Technical decisions and trade-offs:**

  - **Command structure**: Used a flag-based approach (`--update-instructions`)
  rather than a subcommand to match the task requirements exactly

  - **File selection**: Maintained the same interactive selection UI as the init
  command for consistency

  - **Error handling**: Added validation to ensure the command only works in
  initialized backlog projects

  - **Reusability**: Leveraged existing `addAgentInstructions` function to avoid
  code duplication


  **Modified files:**

  - `src/cli.ts`: Added new `agents` command group with `--update-instructions`
  flag

  - `src/test/cli-agents.test.ts`: Created comprehensive test suite covering all
  command scenarios including help text, file selection, error cases, and
  multiple file updates
acceptance_criteria:
  - index: 1
    text: New 'agents' command group is created
    checked: true
  - index: 2
    text: >-
      --update-instructions flag updates agent instruction files (.cursorrules
      CLAUDE.md AGENTS.md GEMINI.md .github/copilot-instructions.md)
    checked: true
  - index: 3
    text: Command follows same pattern as 'backlog init' for file updates
    checked: true
  - index: 4
    text: Command handles cases where files don't exist
    checked: true
  - index: 5
    text: Command provides confirmation of successful update
    checked: true
  - index: 6
    text: Help text documents the new command
    checked: true
  - index: 7
    text: Tests verify the command works correctly
    checked: true
definition_of_done: []
comments: []
---

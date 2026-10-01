---
task_schema_version: 2
id: BACK-205
title: Fix Claude Code agent trying to use slash commands instead of backlog CLI
status: Done
assignee:
  - '@claude'
created_date: '2025-07-25'
updated_date: '2025-07-25'
labels:
  - bug
  - agent
dependencies: []
priority: high
description: >-
  The project-manager-backlog agent is attempting to use slash commands like
  '/create-task' which don't exist in the backlog system. The agent should be
  using proper backlog CLI commands like 'backlog task create' as documented in
  the agent file.
implementation_plan: |-
  1. Analyze the agent file to understand why slash commands are being used
  2. Add explicit warnings and examples to prevent slash command usage
  3. Provide concrete CLI command examples
  4. Test the updated agent behavior
implementation_notes: >-
  Updated the project-manager-backlog.md agent file to be more explicit about
  NOT using slash commands. Added clear warnings, concrete examples of correct
  CLI usage, and a specific example showing what NOT to do. The agent now
  clearly states 'NEVER use slash commands' and provides the exact format for
  backlog CLI commands.
acceptance_criteria:
  - index: 1
    text: Agent correctly uses 'backlog task create' command
    checked: true
  - index: 2
    text: Agent no longer attempts to use slash commands
    checked: true
  - index: 3
    text: >-
      Claude Code properly invokes backlog CLI commands instead of non-existent
      slash commands
    checked: true
definition_of_done: []
comments: []
---

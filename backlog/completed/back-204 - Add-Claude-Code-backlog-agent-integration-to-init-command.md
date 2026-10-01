---
task_schema_version: 2
id: BACK-204
title: Add Experimental Claude Code backlog.md agent integration to init command
status: Done
assignee:
  - '@claude'
created_date: '2025-07-25'
labels:
  - cli
  - integration
  - dx
dependencies: []
priority: medium
description: >-
  Enhance the init flow to optionally install a specialized Claude Code agent
  for backlog.md task management
implementation_plan: |-
  1. Add project-manager-backlog.md import to guidelines/index.ts
  2. Create installClaudeAgent function in agent-instructions.ts
  3. Add Claude agent prompt after agent guidelines selection in init command
  4. Install agent to project's .claude/agents/ directory (not user home)
  5. Add tests for the installation functionality
implementation_notes: >-
  - Created symlink from .claude/agents/project-manager-backlog.md to
  src/guidelines/

  - Added CLAUDE_AGENT_CONTENT export to guidelines/index.ts for bundling

  - Added installClaudeAgent function that installs to project root, not user
  home

  - Integrated prompt into init flow after agent guidelines selection

  - Added comprehensive tests for agent installation

  - Updated .gitignore to track .claude/agents while ignoring rest of .claude
acceptance_criteria:
  - index: 1
    text: New question added after agent guidelines in init flow
    checked: true
  - index: 2
    text: Agent file copied to project's .claude/agents/ directory when selected
    checked: true
  - index: 3
    text: project-manager-backlog.md properly embedded in backlog bundle
    checked: true
  - index: 4
    text: Installation is optional and clearly explained to users
    checked: true
definition_of_done: []
comments: []
---

---
task_schema_version: 2
id: BACK-358
title: Rename Task Completion Guide to Task Finalization Guide
status: Done
assignee:
  - '@codex'
created_date: '2026-01-04 22:48'
updated_date: '2026-01-16 17:58'
labels:
  - documentation
  - workflow
dependencies: []
priority: low
description: >-
  ## Context

  The "Task Completion Guide" name is misleading. Agents interpret "completion"
  as "finishing the implementation work" rather than "finalizing the task record
  after implementation." This causes agents to skip important finalization steps
  or conflate implementation with administrative closure.


  ## Problem

  - "Completion" sounds like "complete the work" when it means "finalize the
  task lifecycle"

  - The execution guide has no handoff to the finalization workflow

  - Agents may skip Definition of Done, implementation notes, and proper status
  updates


  ## Solution

  Rename "Task Completion Guide" to "Task Finalization Guide" throughout the
  codebase and add a clear cross-reference from the execution guide to the
  finalization guide.
implementation_plan: >-
  1. Create feature branch from main

  2. Rename file: task-completion.md → task-finalization.md

  3. Update file content: headings and terminology

  4. Update index.ts: import path and export name

  5. Update workflow-guides.ts: key, uri, name, description, toolName,
  toolDescription

  6. Update overview.md: guide reference and URI

  7. Update overview-tools.md: tool name references

  8. Update agent-nudge.md: guide reference

  9. Update task-execution.md: cross-reference to finalization guide

  10. Run type check and tests

  11. Commit changes
implementation_notes: >-
  Renamed "Task Completion Guide" to "Task Finalization Guide" throughout the
  codebase to avoid confusion with "completing the implementation work."


  **Changes:**

  - Renamed `task-completion.md` → `task-finalization.md`

  - Updated MCP resource URI: `backlog://workflow/task-finalization`

  - Updated MCP tool: `get_task_finalization_guide`

  - Updated all internal references in overview.md, overview-tools.md,
  agent-nudge.md, index.ts, workflow-guides.ts

  - Updated guide headings: "Finalization Workflow", "After Finalization"

  - Added "Finalizing the Task" section to execution guide with cross-reference

  - Updated test expectations in mcp-server.test.ts


  **Breaking change:** MCP tool name and resource URI changed. Existing agents
  referencing old names will need to update.
acceptance_criteria:
  - index: 1
    text: Execution guide ends with a reference to the finalization guide
    checked: true
  - index: 2
    text: File renamed from task-completion.md to task-finalization.md
    checked: true
  - index: 3
    text: 'MCP resource URI updated to backlog://workflow/task-finalization'
    checked: true
  - index: 4
    text: >-
      MCP tool renamed from get_task_completion_guide to
      get_task_finalization_guide
    checked: true
  - index: 5
    text: >-
      All internal references updated (overview.md, overview-tools.md,
      agent-nudge.md, index.ts, workflow-guides.ts)
    checked: true
  - index: 6
    text: 'Guide content updated: headings use "Finalization" instead of "Completion"'
    checked: true
definition_of_done: []
comments: []
---

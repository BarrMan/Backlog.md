---
task_schema_version: 2
id: BACK-507.5
title: Documentation and MCP compatibility updates
status: Done
assignee:
  - '@codex'
created_date: '2026-06-13 14:13'
updated_date: '2026-06-13 20:39'
labels: []
milestone: m-7
dependencies: []
parent_task_id: BACK-507
priority: medium
ordinal: 36000
description: >-
  Update public docs and tests so CLI instructions are documented as the
  recommended AI workflow while MCP remains an optional connector. Remove stale
  MCP-first wording where it conflicts with the current direction, while keeping
  the documented MCP workflow available for users who choose it.


  Important cleanup: README currently references `backlog://docs/task-workflow`,
  while the implemented MCP resources are `backlog://workflow/overview`,
  `task-creation`, `task-execution`, and `task-finalization`. Documentation
  should point users to `backlog instructions` instead of source file paths.
implementation_plan: >-
  # Implementation Plan


  1. Update README getting-started and AI-agent sections to describe CLI
  instructions as the recommended default and MCP as optional.

  2. Update CLI-INSTRUCTIONS init/reference sections to mention the new `backlog
  instructions` command and short agent nudge.

  3. Correct stale MCP resource references to `backlog://workflow/...` and avoid
  pointing users at source files for setup guidance.

  4. Add or adjust docs/tests only where they lock user-facing wording.

  5. Run targeted docs-related tests plus TypeScript and lint/check at final
  verification.
final_summary: >-
  Updated README and CLI reference docs to describe CLI instructions as the
  recommended AI workflow, corrected stale MCP resource references, preserved
  MCP workflow tests, and removed the internal version label from public
  code/docs and Backlog task metadata.
acceptance_criteria:
  - index: 1
    text: >-
      README and CLI reference describe CLI instructions as the recommended AI
      integration and MCP as optional.
    checked: true
  - index: 2
    text: >-
      Manual setup docs tell users to fetch guidance with `backlog instructions`
      instead of copying source files.
    checked: true
  - index: 3
    text: >-
      Stale MCP resource references are corrected to the implemented
      `backlog://workflow/...` URIs.
    checked: true
  - index: 4
    text: >-
      MCP tests continue to assert the existing resources/tools remain available
      for explicit MCP users.
    checked: true
  - index: 5
    text: >-
      Docs mention that task markdown remains human-readable but should be
      modified through CLI/MCP/Web surfaces.
    checked: true
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: true
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: true
  - index: 3
    text: bun test (or scoped test) passes
    checked: true
comments: []
---

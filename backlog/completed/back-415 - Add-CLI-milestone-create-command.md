---
task_schema_version: 2
id: BACK-415
title: Add CLI milestone create command
status: Done
assignee:
  - '@claude'
created_date: '2026-04-25 12:14'
updated_date: '2026-07-04 14:11'
labels:
  - cli
  - milestones
  - enhancement
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/232'
priority: medium
description: >-
  Track GitHub issue #232: provide a public CLI path for creating milestones,
  using the current milestone file storage model.
implementation_notes: >-
  Already implemented on main as of commit d0f3cff; closing with evidence
  instead of re-implementing. Evidence: 'backlog milestone add <name>' with
  -d/--description exists in src/cli.ts (~line 3261, with help schema and
  examples) and creates a milestone markdown file in the active milestones
  directory via the shared MilestoneHandlers.addMilestone
  (src/mcp/tools/milestones/handlers.ts ~line 343), which rejects duplicate
  names/alias conflicts with a clear error ('Milestone alias conflict: ...',
  ~line 358). Created milestones use the current milestone file storage model
  and appear in 'backlog milestone list' and milestone-aware views. Documented
  in CLI-INSTRUCTIONS.md milestone table. Tests:
  src/test/cli-milestone-management.test.ts covers 'adds milestone files with
  descriptions and rejects duplicate aliases', auto-commit behavior, and CLI/MCP
  handler parity. DoD: no code touched for this closure; tsc/biome/tests
  verified passing on main during triage.
final_summary: >-
  No code change needed: 'backlog milestone add' already exists with
  duplicate/alias validation, milestone-file storage, list integration, and test
  coverage. Closed as already implemented on main (d0f3cff). Tracks GitHub issue
  #232.
acceptance_criteria:
  - index: 1
    text: >-
      A CLI milestone create command creates a milestone using the current
      milestone storage model.
    checked: true
  - index: 2
    text: Duplicate milestone names or IDs are rejected with a clear error.
    checked: true
  - index: 3
    text: >-
      Created milestones appear in milestone list and existing milestone-aware
      views.
    checked: true
  - index: 4
    text: Tests cover successful creation and duplicate validation.
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

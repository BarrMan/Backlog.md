---
task_schema_version: 2
id: BACK-507.9
title: Task list CLI parity with MCP filters
status: Done
assignee:
  - '@gpt-5.5-xhigh'
created_date: '2026-06-13 21:14'
updated_date: '2026-06-13 21:25'
labels: []
dependencies: []
modified_files:
  - src/cli.ts
  - src/test/cli.test.ts
  - src/guidelines/cli-instructions/overview.md
  - src/guidelines/cli-instructions/task-creation.md
  - src/guidelines/cli-instructions/task-execution.md
  - CLI-INSTRUCTIONS.md
parent_task_id: BACK-507
priority: high
ordinal: 40000
description: >-
  Add CLI support for the task_list filter capabilities currently available
  through MCP but missing from backlog task list: labels, search, and limit. The
  CLI behavior should stay compatible with existing task list filtering and
  plain output, remain useful for agents, and update the new CLI instruction
  guides so agents discover these filters from backlog instructions.
implementation_plan: >-
  1. Extend `src/cli.ts` task list help schema/options with `--labels`,
  `--search`, and `--limit`, including clear comma/repeated labels guidance and
  examples.

  2. Parse labels with the existing `parseDelimitedStringList` helper, validate
  `--limit` as a positive integer, and keep current priority/sort validation
  behavior.

  3. Reuse `core.queryTasks({ query, filters, includeCrossBranch: false })` for
  status/assignee/milestone/parent/priority/search filtering, then apply
  MCP-equivalent all-label matching in the CLI task-list path.

  4. Preserve existing plain output shape by sorting/grouping as before and
  applying limit after the predictable sort/group order, including across status
  buckets.

  5. Seed interactive task list filters with search/labels/limit while
  preserving existing TUI behavior and parent validation.

  6. Update `src/guidelines/cli-instructions/overview.md`, `task-creation.md`,
  and `task-execution.md` so agents discover task-list filters from `backlog
  instructions`; update public CLI reference if needed.

  7. Add focused CLI/instruction tests for labels, search, limit, combined
  filters, invalid limit, help output, and instruction-guide copy; run focused
  tests, typecheck, and Biome check.
implementation_notes: >-
  Started implementation on branch `tasks/back-507-agent-cli-workflow`. Initial
  scope: add `labels`, `search`, and positive `limit` support to `backlog task
  list`, update public help schema/examples and new CLI instruction guides, and
  cover behavior with focused CLI/instruction tests.


  Context discovery complete. Closest analogs: MCP `task_list` handler in
  `src/mcp/tools/tasks/handlers.ts`, CLI `search --limit` validation in
  `src/cli.ts`, and task-list tests in `src/test/cli.test.ts`. Main
  implementation risk is label semantics: `core.applyTaskFilters` uses any-label
  matching, while MCP `task_list.labels` uses all-label matching, so CLI list
  labels will be applied explicitly in the command path for parity.


  Implemented and verified task-list CLI parity for `labels`, `search`, and
  `limit`. Labels intentionally use MCP-equivalent all-label matching; `--limit`
  is validated as a positive integer and applied after the CLI's existing
  plain-output sort/group order. Verification passed: focused CLI subset, full
  `src/test/cli.test.ts`, `bunx tsc --noEmit`, and `bun run check .`.
final_summary: >-
  ## Summary


  - Added `backlog task list` support for `--labels`, `--search`, and `--limit`,
  including help schema entries and examples.

  - Preserved existing plain output shape while applying search with existing
  filters, MCP-equivalent all-label matching, and positive limit validation
  after predictable CLI sorting/grouping.

  - Seeded interactive task-list filters for the new options without changing
  the existing no-filter interactive path.

  - Updated CLI instruction guides and `CLI-INSTRUCTIONS.md` so agents discover
  filtered task listing from `backlog instructions` and public docs.


  ## Tests


  - `bun test src/test/cli.test.ts --test-name-pattern "task list command|prints
  selected instruction guides|shows task command field types in help"`

  - `bun test src/test/cli.test.ts`

  - `bunx tsc --noEmit`

  - `bun run check .`


  ## Notes


  - Combined filter coverage uses milestone title input because the existing
  milestone resolver in this branch matches titles reliably in the task-list
  path; milestone ID matching behavior was left unchanged as out of scope.
acceptance_criteria:
  - index: 1
    text: >-
      backlog task list supports a labels filter equivalent to MCP task_list
      labels, including multiple labels and clear help text for the expected
      input format.
    checked: true
  - index: 2
    text: >-
      backlog task list supports a search filter equivalent to MCP task_list
      search and applies it together with existing status, assignee, milestone,
      parent, priority, and labels filters.
    checked: true
  - index: 3
    text: >-
      backlog task list supports a positive limit option equivalent to MCP
      task_list limit, with validation and predictable ordering before limiting.
    checked: true
  - index: 4
    text: >-
      Plain text output remains agent-friendly and existing interactive behavior
      is not regressed.
    checked: true
  - index: 5
    text: >-
      backlog task list --help includes input schema entries for labels, search,
      and limit, plus updated examples.
    checked: true
  - index: 6
    text: >-
      The new CLI instruction guides mention these task list filters where
      agents are taught to search/list tasks before acting.
    checked: true
  - index: 7
    text: >-
      Tests cover labels, search, limit, combined filters, invalid limit, help
      output, and relevant instruction-guide copy.
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

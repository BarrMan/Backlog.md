---
task_schema_version: 2
id: BACK-384
title: Fix milestone rename to use milestone files as single source of truth
status: Done
assignee:
  - '@codex'
created_date: '2026-02-11 22:40'
updated_date: '2026-02-12 03:14'
labels: []
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/521'
description: >-
  Issue #521 reports mixed milestone behavior: task milestone values are updated
  but milestone metadata and config remain stale after milestone rename. The
  milestone system should be aligned to milestone files as the canonical source
  and avoid relying on a separate config milestone list.
implementation_plan: >-
  1. Add file-system milestone mutation support for active milestone files:
  resolve by ID/title, rename milestone metadata/title, and update filename slug
  while preserving milestone ID and body content.

  2. Update MCP milestone handlers to treat milestone files as canonical:
  `milestone_rename` mutates the milestone file and (when requested) rewrites
  matching local tasks to the canonical milestone ID; `milestone_remove`
  archives the milestone file and keeps existing clear/keep/reassign task
  handling semantics.

  3. Tighten validation/messages and tool metadata to remove legacy config-list
  wording and enforce active-file checks where needed (e.g., reassign target).

  4. Expand MCP milestone tests to reproduce issue #521 and assert file-first
  behavior (rename updates milestone file title/filename and does not leave
  stale metadata; remove archives file and updates tasks according to handling
  mode).

  5. Run focused tests (`bun test src/test/mcp-milestones.test.ts`) then run
  `bunx tsc --noEmit` and `bun run check .`; fix any issues and finalize task
  metadata.
implementation_notes: >-
  Reproduced issue #521 locally with MCP test harness: after
  `milestone_add(Infosec)` and
  `milestone_rename(from=Infosec,to=IT,updateTasks=true)`, `listMilestones()`
  still returns title `Infosec` while task milestone changed to raw `IT`. This
  confirms milestone file metadata is not updated and task value diverges from
  canonical milestone ID.
final_summary: >-
  Aligned milestone behavior to use milestone files as the single source of
  truth across MCP, core, server, CLI, TUI, and web flows.


  Key outcomes:

  - `milestone_rename` and related operations now resolve by milestone IDs first
  (including zero-padded/canonical aliases) and avoid ambiguous title
  collisions.

  - Milestone mutation flows use file-backed state consistently, with stronger
  alias collision checks and deterministic canonical ID selection.

  - Auto-commit logic was hardened to commit only operation-related paths and to
  rollback/reset staged paths on commit failures.

  - Added broad regression coverage for issue #521 scenarios
  (rename/remove/update with ID/title aliases, archived collisions, zero-padded
  IDs, and commit isolation).


  Validation run:

  - `bun test` (full suite)

  - `bun test src/test/mcp-milestones.test.ts --test-name-pattern "renames
  milestones and updates local tasks by default"`

  - `bunx tsc --noEmit`

  - `bun run check .`
acceptance_criteria:
  - index: 1
    text: >-
      Renaming a milestone updates milestone metadata in the milestone file(s)
      and no stale milestone title remains in files after rename
    checked: true
  - index: 2
    text: >-
      Milestone-related MCP operations consistently derive milestone state from
      milestone files rather than a separate config milestone list
    checked: true
  - index: 3
    text: >-
      Regression coverage demonstrates milestone rename/update flow and guards
      against mixed config/file behavior
    checked: true
  - index: 4
    text: >-
      Relevant tests pass for milestone operations and existing behavior remains
      compatible
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

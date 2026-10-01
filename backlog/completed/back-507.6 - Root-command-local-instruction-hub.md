---
task_schema_version: 2
id: BACK-507.6
title: Root command local instruction hub
status: Done
assignee:
  - '@codex'
created_date: '2026-06-13 19:10'
updated_date: '2026-06-13 21:12'
labels: []
dependencies: []
modified_files:
  - src/cli.ts
  - src/ui/root-entry.ts
  - src/ui/splash.ts
  - src/commands/instructions.ts
  - src/guidelines/cli-agent-nudge.md
  - src/guidelines/cli-instructions/overview.md
  - src/guidelines/cli-instructions/init-required.md
  - src/guidelines/cli-instructions/task-creation.md
  - src/guidelines/cli-instructions/task-execution.md
  - README.md
  - CLI-INSTRUCTIONS.md
  - src/test/cli-root-entry.test.ts
  - src/test/cli.test.ts
parent_task_id: BACK-507
priority: medium
ordinal: 37000
description: >-
  Turn the CLI documentation entry points into plain-text instruction surfaces.
  The bare `backlog` command and `backlog instructions` should print plain text
  by default: no TTY UI, no rich terminal rendering, and no `--plain`
  requirement for documentation discovery.
implementation_plan: >-
  Copy audit plan:

  1. Inspect the branch diff for user-facing copy added or changed by this work.

  2. Search changed files for wording that explains implementation choices
  instead of telling users what to do.

  3. Rewrite command output and documentation copy to be direct user or agent
  instructions.

  4. Update tests that lock in the corrected wording.

  5. Run focused instruction/root tests, typecheck, and Biome check.
implementation_notes: >-
  Implemented the plain-text documentation surface. Bare `backlog` prints a
  local entry point with setup/common workflow commands, instruction guide
  commands, command help, and the text logo. `backlog instructions` prints a
  plain guide index by default, while `backlog instructions <guide>` prints
  guide markdown directly.


  Review corrections completed:

  - Restored the printed Backlog.md text logo at the top of bare `backlog`
  output.

  - Removed explanatory implementation wording from command output, root command
  help copy, generated agent nudge, CLI guide markdown, README,
  CLI-INSTRUCTIONS, and task copy.

  - Kept the root command non-interactive with no ANSI styling, OSC hyperlinks,
  or online docs pointer.


  Refined `backlog instructions` index copy after review: removed the
  self-referential `backlog instructions` start-here row, quoted command
  examples, added `->` guide descriptions, and made `overview` the required
  first read in both the index and local instruction summary.


  Enriched the overview guide's detailed-guide list so each `backlog
  instructions ...` command includes the same concise description style used by
  the instruction index.


  Strengthened the overview guide's direct-edit warning with an `Important:`
  prefix and the reason: Backlog commands keep automatic metadata complete.
final_summary: >-
  Implemented plain-text local documentation entry points: bare `backlog` now
  prints a local command guide instead of the old online docs URL, and `backlog
  instructions` lists guides by default with guide-specific markdown available
  through `backlog instructions <guide>`. Updated agent nudge/docs/tests for the
  default plain-text instruction workflow, restored the text logo, and completed
  a copy audit of user-facing surfaces. Verification passed: focused
  root-entry/instructions tests, `bunx tsc --noEmit`, and `bun run check .`;
  full `bun test` passed before the final copy-only corrections.
acceptance_criteria:
  - index: 1
    text: >-
      Bare `backlog` output is always plain text and no longer presents
      `https://backlog.md` as the primary docs path.
    checked: true
  - index: 2
    text: >-
      Bare `backlog` output points to local instruction commands, especially
      `backlog instructions`, guide-specific commands, and command-specific
      `--help`.
    checked: true
  - index: 3
    text: >-
      `backlog instructions` prints a plain text guide index for overview, task
      creation, task execution, task finalization, and initialization guidance
      by default.
    checked: true
  - index: 4
    text: >-
      Guide-specific `backlog instructions <guide>` output prints guide markdown
      by default, without requiring `--plain`.
    checked: true
  - index: 5
    text: >-
      The documentation entry points reuse the same workflow guide content as
      the instruction commands instead of stale online docs.
    checked: true
  - index: 6
    text: >-
      Tests cover root plain-text behavior, instruction-list behavior,
      guide-specific output, and removal of the old online docs pointer.
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

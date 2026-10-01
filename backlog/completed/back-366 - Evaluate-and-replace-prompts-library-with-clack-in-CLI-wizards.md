---
task_schema_version: 2
id: BACK-366
title: Evaluate and replace prompts library with clack in CLI wizards
status: Done
assignee:
  - '@codex'
created_date: '2026-01-15 22:19'
updated_date: '2026-02-20 22:31'
labels: []
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/pull/535'
description: >-
  Why: improve CLI prompt experience and align with the preferred library while
  keeping Backlog.md’s interactive flows maintainable.

  What: plan and execute the library switch for CLI prompts, covering all
  user-facing interactive flows and their tests, without changing user-visible
  outcomes unless explicitly required by the new library.
implementation_plan: >-
  1. Migrate init, advanced config wizard, and remaining prompt-driven CLI flows
  to Clack.

  2. Preserve prompt semantics (questions/options/defaults/validation/cancel
  behavior) while addressing discovered UX regressions.

  3. Remove legacy prompts dependency and validate the full CLI/test/build
  pipeline.
final_summary: >-
  Completed the prompts-library migration to Clack across the full CLI surface
  area in scope. This includes init wizard migration, advanced config wizard
  migration, and remaining prompt command migration (`agents --update`,
  cleanup), plus removal of legacy `prompts` dependencies from runtime and
  package manifests. Behavior parity was preserved and refined through follow-up
  fixes: idempotent init config preservation, stable default handling via
  `initialValue`, required MCP client selection, step-back navigation from
  nested advanced prompts, and corrected cancellation short-circuiting for
  grouped prompts. Full validation passed after final changes: `bunx tsc
  --noEmit`, `bun run check .`, `bun test`, `bun run build`.
acceptance_criteria:
  - index: 1
    text: >-
      All interactive CLI prompt flows in scope use the new prompts library
      consistently.
    checked: true
  - index: 2
    text: >-
      User-facing behavior remains equivalent to current flows (same
      questions/options/validation) unless explicitly documented as a change.
    checked: true
  - index: 3
    text: Automated tests covering prompt-driven flows are updated to pass.
    checked: true
  - index: 4
    text: The old prompts dependency is fully removed from the project.
    checked: true
definition_of_done: []
comments: []
---

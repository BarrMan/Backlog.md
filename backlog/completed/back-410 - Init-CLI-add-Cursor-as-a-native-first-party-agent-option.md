---
task_schema_version: 2
id: BACK-410
title: 'Init: keep Cursor on AGENTS.md and remove obsolete rule artifacts'
status: Done
assignee:
  - '@codex'
created_date: '2026-03-25 18:13'
updated_date: '2026-08-01 22:22'
labels:
  - cli
  - init
  - agents
  - cursor
dependencies: []
references:
  - >-
    https://cursor.com/docs (verify current rules/skills paths when
    implementing)
modified_files:
  - CLI-INSTRUCTIONS.md
  - README.md
  - src/agent-instructions.ts
  - src/cli.ts
  - src/guidelines/index.ts
  - src/test/cli-init-create.test.ts
  - src/test/cli-init-cursor-pty.test.ts
  - src/test/web-initialization-cursor.test.tsx
  - src/web/components/InitializationScreen.tsx
description: >-
  Treat Cursor as a first-class Backlog init choice through the shared
  `AGENTS.md` instruction target. The `cursor` non-interactive alias, CLI wizard
  labels, agents update flow, and Web initialization must consistently direct
  Cursor users to `AGENTS.md`. Remove only obsolete Backlog-owned Cursor rule
  templates or references. Do not inspect, migrate, delete, or overwrite
  unrelated user-managed `.cursor/rules` content, and preserve existing
  `AGENTS.md` content and idempotent Backlog marker updates.
implementation_plan: >-
  1. Remove only dead Backlog-owned Cursor-specific guideline exports and marker
  branches; leave user Cursor rule paths untouched.

  2. Keep the existing cursor-to-AGENTS.md mappings across CLI and Web init, and
  document the shared target plus coexistence with user-managed Cursor rules.

  3. Add real CLI, PTY, idempotency, combined-selection, and Web selector
  coverage, then run focused and repository-wide verification before finalizing
  the task.
implementation_notes: >-
  Approved direction implemented by PR #799: Cursor remains mapped to the shared
  AGENTS.md target across CLI, agents-update, and Web initialization. The change
  removes only obsolete Backlog-owned Cursor guideline and marker code;
  user-managed `.cursor/rules` content is preserved and may coexist without
  migration or removal. Focused coverage verifies existing AGENTS.md
  preservation, repeated init, shared-target deduplication, non-creation of
  Backlog Cursor rule files, a PTY no-editor flow, and the Web selector payload.


  Final verification (2026-08-01): refreshed PR #799 head
  b6756726989084b2d70406fa69a9a42807be744d passed 10 current-head checks:
  Ubuntu/macOS/Windows lint-and-unit, Ubuntu/macOS/Windows compile-and-smoke,
  Nix packaging, both CodeQL analyses, and the CodeQL app check. Local
  merged-base verification passed 61 focused tests, the opt-in PTY test, `bunx
  tsc --noEmit`, `bun run check .`, `bun run build`, and `git diff --check`.
  Thread-aware review audit found no comments, reviews, or unresolved threads.
  PR #799 merged as d7202e7fe35340213335e8659fe3588ecc38e416.
final_summary: >-
  Cursor remains a first-class init choice through the shared `AGENTS.md` target
  across CLI, agents-update, and Web flows. Obsolete Backlog-owned Cursor rule
  artifacts were removed while existing `AGENTS.md` content and user-managed
  `.cursor/rules` remain untouched. Verified by the full green current-head
  CI/CodeQL/Nix suite and focused local CLI, PTY, Web, typecheck, lint, build,
  and diff checks.
acceptance_criteria:
  - index: 1
    text: >-
      CLI initialization accepts `--agent-instructions cursor` and maps it to
      `AGENTS.md`, while interactive CLI and agents-update selections identify
      Cursor under `AGENTS.md`
    checked: true
  - index: 2
    text: >-
      Web initialization identifies `AGENTS.md` as the Cursor instruction file
      and sends that shared target to the init API
    checked: true
  - index: 3
    text: >-
      Cursor selection creates or updates `AGENTS.md` and does not create
      `.cursor/rules`, `.cursorrules`, or another Cursor-specific Backlog
      instruction file
    checked: true
  - index: 4
    text: >-
      Existing `AGENTS.md` content is preserved and repeated initialization
      keeps one current Backlog marker block
    checked: true
  - index: 5
    text: >-
      Combined Cursor and other agent selections create each shared instruction
      target once without changing the behavior of Claude, Gemini, Copilot, MCP
      setup, or skip options
    checked: true
  - index: 6
    text: >-
      Documentation and public init help explain that Cursor uses `AGENTS.md`
      and that unrelated user-managed Cursor rules may coexist without implicit
      migration or removal
    checked: true
  - index: 7
    text: >-
      Focused real CLI tests cover non-interactive Cursor selection, combined
      selections, repeated init, and a PTY run that completes without opening an
      editor; focused Web coverage verifies the Cursor selector copy and
      `AGENTS.md` target
    checked: true
  - index: 8
    text: >-
      Obsolete Backlog-owned Cursor rule templates and references are removed
      without deleting ambiguous or user-owned Cursor content
    checked: true
  - index: 9
    text: >-
      Relevant focused and full tests, `bunx tsc --noEmit`, `bun run check .`,
      and `bun run build` pass
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

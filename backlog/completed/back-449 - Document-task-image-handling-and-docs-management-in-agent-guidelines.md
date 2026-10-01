---
task_schema_version: 2
id: BACK-449
title: Document task image handling and docs management in agent guidelines
status: Done
assignee:
  - '@codex'
created_date: '2026-04-26 13:05'
updated_date: '2026-04-26 13:17'
labels:
  - documentation
dependencies: []
modified_files:
  - src/guidelines/agent-guidelines.md
priority: low
description: >-
  Document agent-facing guidance for task image assets and the
  document-management public APIs after the document CLI/MCP/Web cleanup. The
  guidance should explain local backlog assets for task images and align
  docs-management instructions with the shared document
  create/update/list/view/search contract from CLI, Web, and MCP.
implementation_notes: >-
  Rebased PR #598 onto current main after BACK-436/BACK-610 document-management
  cleanup. Removed the fork-created BACK-448 task because task IDs must be
  created on main; this PR now uses BACK-449, which was created directly on
  main.


  Kept the useful task-image guidance, corrected asset path wording, and
  replaced the stale long Docs Management section with concise guidance aligned
  to the current public surface: CLI doc create/list/view, MCP
  document_create/document_update, docs-relative paths, unsafe path rejection,
  and supported document types.


  Validation passed: `bun run check .`, `bunx tsc --noEmit`, and `bun test
  src/test/server-assets.test.ts`.


  Confirmed the CLI surface after the user question about `doc update`: `backlog
  doc --help` and `src/cli.ts` expose only `doc create`, `doc list`, and `doc
  view`; document updates are currently MCP/Web only. Added an explicit
  guideline sentence so agents do not infer a nonexistent CLI update command.
final_summary: >-
  Updated agent guidelines for task image assets and current document-management
  APIs.


  Changes:

  - Documented local task image storage under backlog/assets and Markdown
  references using assets/<relative-path>.

  - Replaced stale docs CLI guidance with the current public contract from the
  recent docs cleanup: CLI create/list/view, MCP/Web update, docs-relative
  paths, unsafe path rejection, and supported document types.

  - Explicitly called out that the CLI does not currently expose `doc update`,
  so agents should use MCP or Web UI for document updates.

  - Removed the fork-created BACK-448 task and completed BACK-449 from main for
  this PR.
acceptance_criteria:
  - index: 1
    text: >-
      Agent guidelines document task image asset storage, supported formats,
      Markdown references, and browser serving behavior.
    checked: true
  - index: 2
    text: >-
      Agent guidelines document the current docs-management public surface
      without telling agents to rely on stale or source-only behavior.
    checked: true
  - index: 3
    text: >-
      Guidance matches the recent document cleanup: docs paths are relative to
      backlog/docs, unsafe paths are rejected, CLI supports doc
      create/list/view, and MCP/Web provide document update behavior.
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

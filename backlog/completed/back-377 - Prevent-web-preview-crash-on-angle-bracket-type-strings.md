---
task_schema_version: 2
id: BACK-377
title: Prevent web preview crash on angle-bracket type strings
status: Done
assignee:
  - '@codex'
created_date: '2026-02-09 03:55'
updated_date: '2026-02-09 04:02'
labels:
  - bug
  - web
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/504'
priority: high
description: >-
  Fix blank page in browser task details when markdown contains angle-bracket
  type notation like `Result<List<MenuItem>>`. Ensure markdown preview does not
  crash and add regression coverage for problematic content.
implementation_notes: >-
  Reproduced crash in markdown preview rendering path with
  `Result<List<MenuItem>>` and confirmed React throws due tag interpretation
  (`menuitems cannot have children nor dangerouslySetInnerHTML`). Added markdown
  sanitization in `MermaidMarkdown` to escape tag-like `<...` starts (while
  preserving angle-bracket autolinks), preventing React from interpreting type
  notation as HTML tags. Added regression tests for problematic angle-bracket
  content and normal markdown rendering.


  Addressing PR review feedback: preserve non-HTTP autolinks (e.g.,
  `<ftp://...>`, `<foo@example.com>`) while still escaping unsafe tag-like
  angle-bracket sequences.


  Addressed PR feedback by preserving additional CommonMark autolink forms
  during sanitization: URI schemes beyond HTTP(S) (e.g., ftp) and plain email
  autolinks.
final_summary: >-
  Fixed web preview blank-page crash for angle-bracket type strings by
  sanitizing tag-like `<...` sequences before rendering markdown in
  `MermaidMarkdown`. Added regression test `src/test/mermaid-markdown.test.tsx`
  to ensure problematic strings no longer throw and normal markdown behavior
  remains functional.


  Follow-up refinement: sanitizer now preserves generic URI/email autolinks
  while still escaping unsafe tag-like angle-bracket sequences that caused the
  crash.
acceptance_criteria:
  - index: 1
    text: >-
      Opening task details with markdown containing angle-bracket type strings
      (e.g. `Result<List<MenuItem>>`) no longer crashes the web UI.
    checked: true
  - index: 2
    text: Markdown preview remains functional for normal content after the fix.
    checked: true
  - index: 3
    text: >-
      A regression test covers the markdown preview path with problematic
      angle-bracket content.
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

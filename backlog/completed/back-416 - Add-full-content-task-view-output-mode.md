---
task_schema_version: 2
id: BACK-416
title: Add full-content task view output mode
status: Done
assignee:
  - '@claude'
created_date: '2026-04-25 12:14'
updated_date: '2026-07-04 17:52'
labels:
  - cli
  - task-view
  - enhancement
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/289'
priority: medium
description: >-
  Track GitHub issue #289: add an output mode for viewing full task content when
  --plain is too compact.
implementation_notes: >-
  Already implemented on main as of commit d0f3cff; closing with evidence
  instead of re-implementing. Evidence: 'backlog task view <id> --plain' outputs
  all structured sections in full with no truncation via formatTaskPlainText
  (src/formatters/task-plain-text.ts): metadata header, description, acceptance
  criteria, Definition of Done, implementation plan, implementation notes,
  comments, and final summary. Markdown headings inside section content are
  preserved because structured-section extraction
  (src/markdown/structured-sections.ts) only stops at known structured section
  headers, so custom '## ...'/'### ...' headings stay inside their section.
  Tests covering markdown headings inside content sections:
  src/test/update-task-description.test.ts ('### Subsection' preserved in
  implementation notes while editing description),
  src/test/implementation-notes.test.ts ('preserves nested H2 headings when
  migrating legacy implementation notes'), src/test/acceptance-criteria.test.ts
  ('preserves markdown headings inside acceptance criteria when updating').
  Plain output shape is asserted stable in src/test/cli.test.ts. DoD: no code
  touched for this closure; tsc/biome/tests verified passing on main during
  triage.


  Citation correction (review): plain output shape stability is asserted in
  src/test/cli-plain-output.test.ts (CLI plain output for AI agents, incl. 'task
  view --plain'), not src/test/cli.test.ts as previously written.
final_summary: >-
  No code change needed: --plain already emits the full task content (all
  structured sections, untruncated, headings preserved) with test coverage,
  satisfying the full-content output mode request. Closed as already implemented
  on main (d0f3cff). Tracks GitHub issue #289.
acceptance_criteria:
  - index: 1
    text: >-
      A task view option outputs the full markdown content or all structured
      sections without truncation.
    checked: true
  - index: 2
    text: >-
      Existing plain output remains stable unless explicitly documented
      otherwise.
    checked: true
  - index: 3
    text: Tests cover tasks containing markdown headings inside content sections.
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

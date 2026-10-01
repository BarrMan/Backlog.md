---
task_schema_version: 2
id: BACK-679
title: Quote assignee and reporter under every frontmatter key spelling
status: To Do
assignee: []
created_date: '2026-09-02 20:07'
labels: []
dependencies: []
ordinal: 311000
description: >-
  preprocessFrontmatter quotes values for keys it matches, but its patterns only
  recognise the bare key spelling. BACK-678 hit this for due_date and fixed that
  one key. assignee and reporter have the same gap: their pattern is
  /^(\s*(?:assignee|reporter):\s*)(.*)$/, so a file written as "assignee": @alex
  leaves the @ value unquoted, js-yaml throws 'end of the stream or a document
  separator is expected', and the whole task fails to parse rather than
  degrading.


  Quoted keys are legal YAML, so a task file written by another tool or by hand
  can be rejected outright. The fix is the same alternation used for due_date,
  but the blast radius differs: these values feed the flow-list normalisation
  path, so lists, dash-prefixed entries and empty values all need covering
  rather than assuming the due_date shape carries over.
acceptance_criteria:
  - index: 1
    text: >-
      assignee and reporter values are quoted under bare, double-quoted and
      single-quoted key spellings, and the key is preserved as written
    checked: false
  - index: 2
    text: >-
      A task whose assignee or reporter uses a quoted key parses instead of
      throwing, with the value read identically to the bare-key spelling
    checked: false
  - index: 3
    text: >-
      Flow lists, dash-prefixed entries and empty values behave the same under
      every key spelling
    checked: false
  - index: 4
    text: >-
      Tests cover each spelling for both fields, including the @-prefixed value
      that currently makes the parser throw
    checked: false
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: false
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: false
  - index: 3
    text: bun test (or scoped test) passes
    checked: false
comments: []
---

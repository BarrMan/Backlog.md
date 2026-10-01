---
task_schema_version: 2
id: BACK-683
title: Render TUI acceptance-criteria progress as a pie glyph
status: To Do
assignee: []
created_date: '2026-09-02 21:40'
labels: []
dependencies: []
ordinal: 315000
description: >-
  The TUI shows acceptance-criteria progress on In Progress rows as an ASCII
  bar, [###--] 3/5. ASCII was chosen because blessed only guarantees glyph
  fallback for box-drawing, and Block Elements can render blank or as ? on some
  fonts. That caution was applied too broadly: the TUI already renders geometric
  shapes such as ● ○ ◒ ✓ on every supported terminal, and the maintainer had
  asked for Unicode, not ASCII. The bar also sits before the task ID on In
  Progress rows only, so IDs do not line up across rows.


  Replace the bar with a single pie glyph from the same Unicode block as the
  shapes already in use, so it mirrors the radial ring the web shows and costs
  one cell: ○ for nothing checked, ◔ up to a third, ◑ up to two thirds, ◕ above
  that, ● when every criterion is checked, followed by the checked/total count.
  Keep the existing color semantics on the glyph (green when complete, yellow
  underway, red when a third or less). The wide and compact variants collapse
  into one form. Reserve the indicator column on every row so task IDs align
  whether or not a row shows progress. Which rows show progress is unchanged: In
  Progress tasks with criteria.
acceptance_criteria:
  - index: 1
    text: >-
      In Progress rows with criteria show a pie glyph (○ ◔ ◑ ◕ ●) and the
      checked/total count instead of the ASCII bar, on the board and in the task
      list
    checked: false
  - index: 2
    text: >-
      The glyph keeps the existing color semantics: green when all criteria are
      checked, yellow when underway, red when a third or fewer are checked
    checked: false
  - index: 3
    text: >-
      Task IDs align across rows because the indicator column is reserved on
      rows without progress
    checked: false
  - index: 4
    text: >-
      The glyphs render at the correct width in the TUI, verified with the
      existing width test infrastructure, and no Block Elements are introduced
    checked: false
  - index: 5
    text: Plain and MCP list output are unchanged
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

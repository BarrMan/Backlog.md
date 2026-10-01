---
task_schema_version: 2
id: BACK-657
title: >-
  Make the TUI acceptance-criteria bar degrade gracefully without Block Element
  glyphs
status: Done
assignee:
  - '@claude'
created_date: '2026-08-30 13:19'
updated_date: '2026-08-30 15:40'
labels:
  - tui
  - bug
dependencies: []
ordinal: 289000
description: >-
  src/ui/acceptance-criteria-progress.ts:22 builds the list/board progress bar
  from raw U+2588 FULL BLOCK and U+2591 LIGHT SHADE. blessed routes box-drawing
  characters through the DEC Special Graphics charset so trees and borders
  render on any terminal, but Block Elements go out as plain Unicode: a terminal
  font lacking those glyphs draws the bar as blank cells (maintainer-observed: a
  9/10 bar rendered empty), and without a UTF-8 locale every glyph becomes a
  question mark. Make the bar degrade the way box drawing does: ASCII fill, or
  glyphs blessed routes through ACS.
implementation_plan: >-
  1. Research: confirmed in neo-neo-bblessed lib/widgets/screen.ts (draw) that
  only DEC Special Graphics chars (tput.acscr) are ACS-routed; U+2588/U+2591 are
  in neither acscr nor the utoa ASCII fallback, so fonts without Block Elements
  show blanks and non-UTF-8 locales show '?'.

  2. Decision: use plain ASCII '#' (filled) and '-' (empty) instead of
  ACS-routed glyphs. Rationale: the only DEC fill glyph is the checkerboard
  U+2592, which utoa maps to a space on broken/absent-ACS terminals (bar would
  vanish) and reads as half-shade; ASCII is below '~' so it bypasses every
  charset translation and renders identically on all terminals, fonts, and
  locales.

  3. Change the bar characters in src/ui/acceptance-criteria-progress.ts only
  (BACK-652 covers the web component; PR #945 owns board.ts).

  4. Update src/test/tui-acceptance-criteria-progress.test.ts to pin the emitted
  characters.

  5. Verify: bunx tsc --noEmit, bun run check ., bun test.
implementation_notes: >-
  Chose plain ASCII '#'/'-' over ACS-routed glyphs: the only DEC fill glyph
  (U+2592 checkerboard, ACS 'a') falls back to a *space* via blessed's utoa
  table on broken/absent-ACS terminals, so an ACS bar would vanish on exactly
  the degraded terminals this task targets; ASCII stays below '~' and bypasses
  every charset translation in neo-neo-bblessed screen draw, rendering
  identically on all terminals, fonts, and locales. Verification: bunx tsc
  --noEmit clean; bun run check . clean; full bun run test 2568 pass / 0 fail
  (one unrelated flake in an early run did not reproduce twice). Test pins exact
  bars ([######----] 4/7, [###--] 4/7, [#######---] 5/7, [##########] 2/2) plus
  an ASCII-only regex over varied widths/ratios. src/ui/root-entry.ts splash
  logo also uses Block Elements but is decorative and out of scope.
final_summary: >-
  Replaced the raw U+2588/U+2591 bar cells in
  src/ui/acceptance-criteria-progress.ts with ASCII '#' (filled) and '-'
  (empty), so the list/board acceptance-criteria bar renders a visibly filled
  bar on any terminal font or locale instead of blank cells or question marks.
  Verified with pinned-character tests in
  src/test/tui-acceptance-criteria-progress.test.ts and green tsc, biome, and
  full bun test runs.
acceptance_criteria:
  - index: 1
    text: >-
      The progress bar renders a visibly filled bar on terminals whose font
      lacks Block Element glyphs
    checked: true
  - index: 2
    text: >-
      Rendering in a UTF-8-capable terminal with full fonts is unchanged or
      better
    checked: true
  - index: 3
    text: A test pins the emitted characters
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

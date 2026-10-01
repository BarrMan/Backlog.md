---
task_schema_version: 2
id: BACK-681
title: Show due dates on the surfaces that omit them
status: To Do
assignee: []
created_date: '2026-09-02 20:31'
labels: []
dependencies: []
ordinal: 313000
description: >-
  A due date set through any surface is silently absent from several read
  surfaces: board export and non-TTY board render a task row with no date
  (src/board.ts around line 151, used by src/cli.ts around 4598 and
  src/ui/board.ts around 334), draft list --plain omits it (src/cli.ts around
  4043), and the web drafts list omits it (src/web/components/DraftsList.tsx
  around 149).


  Nothing shifts or corrupts the value; it simply is not displayed, so a user
  who sets a due date sees it in some places and not others and cannot tell
  which surfaces are authoritative. Found while auditing the due-date model
  after BACK-678 made due dates a plain calendar day.
acceptance_criteria:
  - index: 1
    text: Board export and non-TTY board output show a task due date when one is set
    checked: false
  - index: 2
    text: draft list --plain and the web drafts list show a due date when one is set
    checked: false
  - index: 3
    text: >-
      Surfaces without a due date are unchanged, with no empty column or
      placeholder introduced
    checked: false
  - index: 4
    text: Tests cover each surface with and without a due date
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

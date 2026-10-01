---
task_schema_version: 2
id: BACK-680
title: Stop one bad draft from hiding every draft
status: To Do
assignee: []
created_date: '2026-09-02 20:31'
labels: []
dependencies: []
ordinal: 312000
description: >-
  listDrafts returns an empty list for ALL drafts when a single draft file fails
  to parse (src/file-system/operations.ts around line 1309), so one malformed
  file makes the entire drafts view look empty rather than showing the rest.
  Tasks and milestones already do the safer thing and skip only the offending
  file (around lines 925 and 1794), so drafts are the outlier.


  Found while auditing the due-date model, but nothing about it is due-date
  specific: any parse failure in any draft triggers it. A user in this state
  sees no drafts at all and has no indication that a file is at fault, which
  reads as data loss rather than as a broken file.
acceptance_criteria:
  - index: 1
    text: >-
      A draft that fails to parse is skipped without affecting the drafts
      returned alongside it
    checked: false
  - index: 2
    text: >-
      Drafts match the behavior tasks and milestones already have for
      unparseable files
    checked: false
  - index: 3
    text: >-
      The user can tell that a file was skipped rather than silently seeing a
      shorter list
    checked: false
  - index: 4
    text: >-
      A test covers a directory containing one unparseable draft and several
      valid ones
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

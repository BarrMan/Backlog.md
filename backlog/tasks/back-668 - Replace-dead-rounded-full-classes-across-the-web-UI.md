---
task_schema_version: 2
id: BACK-668
title: Replace dead rounded-full classes across the web UI
status: To Do
assignee: []
created_date: '2026-08-30 22:16'
labels:
  - web
  - bug
dependencies: []
ordinal: 300000
description: >-
  The compiled Tailwind deliberately excludes `rounded-full` (source.css
  `@source not inline`, since TASK-179; the project utility is
  `rounded-circle`), so every component still using rounded-full silently
  renders square corners. BACK-665 fixed the board loading spinner; the
  remaining known usages are the MilestoneTaskRow/ProjectBadge badges, the Board
  lane count badge and progress bar, TaskColumn drop indicators, and
  MilestonesPage progress/status dots (list recorded on PR #977). Replace them
  with the working utility and consider a lint/test guard so the dead class
  cannot return.
acceptance_criteria:
  - index: 1
    text: >-
      No component references rounded-full; the listed elements render round in
      light and dark
    checked: false
  - index: 2
    text: A guard (grep test or lint rule) fails the build if rounded-full reappears
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

---
task_schema_version: 2
id: BACK-441
title: Add kanban board filters to web UI
status: Done
assignee:
  - '@alex-agent'
created_date: '2026-04-25 22:13'
updated_date: '2026-05-03 12:45'
labels:
  - feature
  - web
  - board
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/pull/574'
  - BACK-260
  - BACK-361
priority: medium
description: >-
  Add focused filtering controls to the Web UI kanban board so users can narrow
  visible cards by assignee, label, and priority. This is the workflow task for
  PR #574; it is related to the broader filter work referenced there, but the
  accepted scope is limited to board-level web UI filtering with URL
  persistence.
final_summary: >-
  Merged PR #574: added board-level assignee, label, and priority filters to the
  Web UI with URL persistence and a clear action. Rebased the contributor branch
  onto current main, regenerated Tailwind CSS, added focused board-filter tests
  including filtered milestone lane metadata, addressed Codex review feedback,
  verified the behavior in a real Chrome browser, and confirmed all GitHub
  checks and Codex review passed before merge.
acceptance_criteria:
  - index: 1
    text: >-
      The board view exposes assignee, label, and priority filters when matching
      task metadata exists.
    checked: true
  - index: 2
    text: >-
      Selected filters are applied together with AND semantics and continue to
      respect existing board lane/milestone behavior.
    checked: true
  - index: 3
    text: >-
      Filter state is reflected in URL query parameters and survives
      reload/navigation.
    checked: true
  - index: 4
    text: >-
      A clear action resets all board filters and removes their URL query
      parameters.
    checked: true
  - index: 5
    text: >-
      Browser verification covers assignee, label, priority, combined filters,
      reload persistence, and clearing filters.
    checked: true
  - index: 6
    text: Existing board interactions are not regressed by the filter controls.
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

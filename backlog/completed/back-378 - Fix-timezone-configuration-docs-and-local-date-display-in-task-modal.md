---
task_schema_version: 2
id: BACK-378
title: Fix timezone configuration docs and local date display in task modal
status: Done
assignee:
  - '@codex'
created_date: '2026-02-09 06:22'
updated_date: '2026-02-09 06:24'
labels:
  - bug
  - web
  - docs
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/508'
priority: high
description: >-
  Resolve issue #508 by removing stale timezonePreference configuration
  documentation and fixing task details modal to display created/updated dates
  in local time instead of raw stored UTC strings.
implementation_notes: >-
  Removed stale `timezonePreference` documentation and type definition to match
  current supported config surface. Added web utility functions to parse stored
  UTC date strings (`YYYY-MM-DD HH:mm` and date-only) and format for local
  display. Updated `TaskDetailsModal` created/updated display to use local
  formatting instead of raw storage strings.
final_summary: >-
  Issue #508 resolved by removing unsupported `timezonePreference` config
  docs/type and fixing task details modal date rendering to display local
  timezone values from stored UTC strings. Added regression tests in
  `src/web/utils/date-display.test.ts` for parse/format behavior.
acceptance_criteria:
  - index: 1
    text: README no longer documents unsupported `timezonePreference` config key.
    checked: true
  - index: 2
    text: >-
      Task details modal displays created/updated dates using local timezone
      formatting rather than raw storage strings.
    checked: true
  - index: 3
    text: >-
      Regression tests cover date parsing/formatting behavior for stored UTC
      datetime strings used by the web UI.
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

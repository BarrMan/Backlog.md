---
task_schema_version: 2
id: BACK-445
title: Add command filters to web search
status: Done
assignee:
  - '@alex-agent'
created_date: '2026-04-26 08:19'
updated_date: '2026-04-26 08:26'
labels:
  - web-ui
  - search
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/pull/338'
modified_files:
  - src/web/components/SideNavigation.tsx
  - src/web/utils/search-command-query.ts
  - src/web/lib/api.ts
  - src/server/index.ts
  - src/core/search-service.ts
  - src/test/search-command-query.test.ts
  - src/test/search-service.test.ts
  - src/test/server-search-endpoint.test.ts
priority: medium
description: >-
  Add field:value command filters to the browser search experience so users can
  narrow tasks, documents, and decisions by structured fields while preserving
  existing text search behavior. This replaces the outdated task-263 reference
  from PR #338, which conflicts with current BACK task IDs.
implementation_plan: >-
  1. Rebuild PR #338 on current main with the new BACK-445 task ID.

  2. Parse sidebar field:value commands into API search parameters while
  preserving free-text search.

  3. Add assignee support to the centralized search filters exposed through
  /api/search.

  4. Cover parser, search service, and search endpoint behavior with focused
  tests.

  5. Push the refreshed PR branch and trigger checks/review.
implementation_notes: >-
  Implemented command parsing for the sidebar search input and routed parsed
  filters through the existing /api/search endpoint. Added assignee support to
  the centralized SearchService filter path so status, priority, assignee,
  labels, type, and modified file command filters can combine with free-text
  queries. Task-only command filters default sidebar search to task results
  unless the user supplies an explicit type filter. Unknown or malformed
  commands are preserved as normal text search terms.
final_summary: >-
  Rebuilt PR #338 on current main under BACK-445. The browser sidebar now parses
  field:value search commands, sends structured filters to the centralized
  search API, and keeps unknown or malformed command tokens as plain text. The
  shared search service and API now support assignee filters, with focused
  parser/service/API coverage plus full suite verification.
acceptance_criteria:
  - index: 1
    text: >-
      Browser search supports field:value command filters for task fields such
      as status, priority, assignee, and labels.
    checked: true
  - index: 2
    text: >-
      Command filters can be combined with free-text search without breaking
      existing text search results.
    checked: true
  - index: 3
    text: >-
      Search behavior handles unknown or malformed command filters predictably
      without crashing the UI.
    checked: true
  - index: 4
    text: The PR title and task references use the current BACK task ID format.
    checked: true
  - index: 5
    text: >-
      Focused automated coverage verifies command parsing/filtering and the
      relevant web search behavior.
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

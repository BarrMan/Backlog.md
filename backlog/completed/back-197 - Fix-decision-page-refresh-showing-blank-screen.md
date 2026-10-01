---
task_schema_version: 2
id: BACK-197
title: Fix decision page refresh showing blank screen
status: Done
assignee: []
created_date: '2025-07-21'
labels: []
dependencies: []
description: >-
  Decision pages show blank screen when refreshed due to server not serving
  index.html for React Router routes. This breaks the user experience for
  deep-linked decision URLs.
implementation_notes: >-
  Fixed server routing issue in src/server/index.ts by changing fallback
  behavior from 404 to serving index.html. This allows React Router to handle
  client-side routing on page refresh. Modified line 274 to return
  indexHtml(req) instead of 404 response.
acceptance_criteria:
  - index: 1
    text: Decision pages load correctly when refreshed
    checked: true
  - index: 2
    text: All JavaScript chunks load properly on refresh
    checked: true
  - index: 3
    text: React Router handles client-side routing correctly
    checked: true
definition_of_done: []
comments: []
---

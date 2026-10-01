---
task_schema_version: 2
id: BACK-181
title: Add statistics dashboard to web UI
status: Done
assignee: []
created_date: '2025-07-12'
updated_date: '2025-08-03 17:20'
labels: []
dependencies:
  - task-180
priority: medium
description: >-
  Create a Statistics/Dashboard page in the web UI that displays project
  overview, task statistics, priority breakdowns, and activity metrics in a
  visual dashboard format with charts and interactive elements.
implementation_notes: >-
  ### What's New

  - Added `/api/statistics` endpoint that reuses CLI logic

  - Created `Statistics.tsx` dashboard component with interactive elements

  - Added navigation link with trending-up icon

  - Tasks in recent activity and project health are clickable to open edit popup


  ### Key Features

  - **Metrics**: Total/completed tasks, completion %, drafts count

  - **Visualizations**: Progress bar, status/priority distributions with mini
  charts

  - **Recent Activity**: Clickable recently created/updated tasks

  - **Project Health**: Compact summary with avg age, stale/blocked task
  indicators

  - **Loading**: Realistic progress messages (2s intervals) matching CLI
  experience


  ### Technical Implementation

  - **Shared Logic**: `Core.loadAllTasksForStatistics()` eliminates CLI/web
  duplication

  - **Data Consistency**: Same task loading, cross-branch checking, conflict
  resolution as CLI

  - **Performance**: Single API call with parallel processing

  - **UX**: Responsive design, dark/light theme support, proper error handling


  ### Files Changed

  - `src/server/index.ts` - API endpoint

  - `src/web/components/Statistics.tsx` - main dashboard

  - `src/core/backlog.ts` - shared statistics loading logic

  - `src/commands/overview.ts` - refactored to use shared logic
acceptance_criteria:
  - index: 1
    text: Add Statistics/Dashboard page route to web UI
    checked: true
  - index: 2
    text: Create /api/statistics endpoint for project metrics
    checked: true
  - index: 3
    text: Display status distribution with visual charts
    checked: true
  - index: 4
    text: Show priority breakdown with color-coded sections
    checked: true
  - index: 5
    text: Include completion percentage and progress indicators
    checked: true
  - index: 6
    text: Display recent activity timeline
    checked: true
  - index: 7
    text: Add interactive charts and data visualizations
    checked: true
  - index: 8
    text: Show project health metrics and trends
    checked: true
  - index: 9
    text: Include export functionality for statistics
    checked: true
  - index: 10
    text: Add navigation link in side menu
    checked: true
  - index: 11
    text: Use responsive design for mobile and desktop
    checked: true
  - index: 12
    text: Handle loading states and empty project gracefully
    checked: true
definition_of_done: []
comments: []
---

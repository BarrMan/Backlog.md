---
task_schema_version: 2
id: BACK-285
title: adjust z-index tooltip style
status: Done
assignee: []
created_date: '2025-10-09 04:58'
updated_date: '2025-10-09 07:03'
labels: []
dependencies: []
priority: low
description: >-
  When the sidebar is collapsed, react-tooltip are hidden by elements in the
  main view.


  - Kanban Board: Behind `task` card

  - All Tasks: Behind Search input
implementation_plan: 'apply `z-index: 10` to sidebar'
implementation_notes: >-
  Added `z-10` class to the sidebar root element

  This ensures tooltips are displayed above other UI elements (kanban board task
  cards, search input) when the sidebar is collapsed

  Modified files: `src/web/components/SideNavigation.tsx`

  Technical decision: Used Tailwind's `z-10` (z-index: 10). This value was
  chosen as no other z-index specifications exist in the project
acceptance_criteria:
  - index: 1
    text: 'In `Kanban Board` page, tooltips are displayed over the `task` cards'
    checked: true
  - index: 2
    text: 'In `All Tasks` page, tooltips are displayed over the Search input'
    checked: true
definition_of_done: []
comments: []
---

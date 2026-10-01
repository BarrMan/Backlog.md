---
task_schema_version: 2
id: BACK-43
title: Remove duplicate Acceptance Criteria and style metadata
status: Done
assignee: []
created_date: '2025-06-11'
updated_date: '2025-06-11'
labels:
  - ui
  - enhancement
dependencies: []
description: >-
  Goal: Eliminate redundant section and improve tag row.


  Detailed work:

  - Wrap the [cli] [agents] tag line in a one-line box (fg:magenta,
  border.fg:grey)

  - Fix that box at the top so it does not scroll with the body
implementation_notes: >-
  Successfully eliminated duplicate "Acceptance Criteria" headings and improved
  tag styling:


  ### Key Changes Made:

  - **Standalone Task Viewer** (`src/ui/task-viewer.ts`):
    - Added fixed tag box at top with height=1, magenta text, grey border
    - Removed redundant "Acceptance Criteria" heading from content (kept only box label)
    - Adjusted layout positions to accommodate new tag box
    - Updated all top positions by +1 to make room for tag box

  - **Popup Task Viewer**:
    - Updated tag display to use consistent styling with border box
    - Magenta text with grey border for labels
    - Adjusted content area positioning

  ### Visual Improvements:

  - **Tag Box Styling**: `fg: magenta`, `border.fg: gray` as specified

  - **Fixed Position**: Tag box doesn't scroll with content, stays at top

  - **Clean Layout**: No more duplicate headings, better visual hierarchy

  - **Consistent Styling**: Both standalone and popup views use same tag styling


  ### Technical Details:

  - Tag box positioned at `top: 3` (after header)

  - All content areas adjusted down by 1 line

  - Height calculations updated for proper spacing

  - Border styling applied correctly with blessed tags


  All acceptance criteria have been met with improved visual organization and
  consistent styling across both view modes.
acceptance_criteria:
  - index: 1
    text: Redundant heading gone; new heading name present
    checked: true
  - index: 2
    text: 'Tag box exists, height = 1, fixed position'
    checked: true
  - index: 3
    text: Visual snapshot shows magenta tags inside a grey border
    checked: true
definition_of_done: []
comments: []
---

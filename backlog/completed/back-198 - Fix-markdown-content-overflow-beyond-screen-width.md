---
task_schema_version: 2
id: BACK-198
title: Fix markdown content overflow beyond screen width
status: Done
assignee: []
created_date: '2025-07-21'
labels: []
dependencies: []
description: >-
  Markdown tables and long content extend beyond viewport causing horizontal
  scrolling, breaking responsive design. This affects documentation and decision
  pages with wide tables.
implementation_notes: >-
  ### Final Solution

  Fixed the overflow issue by adding comprehensive CSS rules to handle the
  MDEditor component's nested markdown content structure:


  1. **Removed problematic classes**: Removed `overflow-x-auto` from component
  classes that was causing unwanted scrolling

  2. **Added targeted CSS rules** in `source.css`:
     - Applied `white-space: pre-wrap`, `word-break: break-word`, and `overflow-wrap: break-word` to `.wmde-markdown pre` and nested elements
     - Set `max-width: 100%` and `overflow-x: hidden` on markdown containers
     - Added specific rules for code blocks, inline code, and `.code-line` elements
     - Used `!important` to override any inline styles from the MDEditor component

  3. **Key changes**:
     - Targets `.wmde-markdown` which is the actual container used by MDEditor
     - Ensures all nested content (pre, code, code-line) wraps properly
     - Prevents horizontal scrolling while maintaining readability

  The solution works by cascading styles to all content rendered by the MDEditor
  component, ensuring long text and code blocks wrap properly instead of causing
  horizontal overflow.
acceptance_criteria:
  - index: 1
    text: Tables fit within screen width with proper text wrapping
    checked: true
  - index: 2
    text: Long text content breaks appropriately at screen edges
    checked: true
  - index: 3
    text: No horizontal scrolling required for normal content
    checked: true
  - index: 4
    text: Tables remain readable on mobile devices
    checked: true
definition_of_done: []
comments: []
---

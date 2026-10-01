---
task_schema_version: 2
id: BACK-228
title: Replace @uiw/react-md-editor with TOAST UI Editor for rich-text editing
status: To do
assignee: []
created_date: '2025-08-10 14:25'
updated_date: '2025-08-10 18:07'
labels:
  - web-ui
  - enhancement
  - editor
dependencies: []
description: >-
  Replace the current @uiw/react-md-editor with TOAST UI Editor across
  DocumentationDetail, DecisionDetail, and TaskForm components. The current
  implementation uses a custom MarkdownEditor wrapper with preview/edit modes -
  we need to maintain this behavior while adding WYSIWYG capabilities.
acceptance_criteria:
  - index: 1
    text: Remove @uiw/react-md-editor dependency from package.json
    checked: false
  - index: 2
    text: Install and configure @toast-ui/editor and @toast-ui/react-editor
    checked: false
  - index: 3
    text: Implement preview-first UI with edit-on-click behavior
    checked: false
  - index: 4
    text: Add mode switching between Markdown and WYSIWYG editing
    checked: false
  - index: 5
    text: Verify markdown export/import functionality works correctly
    checked: false
  - index: 6
    text: Test editor performance with large markdown documents
    checked: false
  - index: 7
    text: >-
      Replace MarkdownEditor component in DocumentationDetail.tsx to use TOAST
      UI with preview-first behavior
    checked: false
  - index: 8
    text: >-
      Replace MarkdownEditor component in DecisionDetail.tsx to use TOAST UI
      with preview-first behavior
    checked: false
  - index: 9
    text: Update TaskForm.tsx to use TOAST UI Editor instead of MDEditor prop
    checked: false
  - index: 10
    text: Maintain existing dark mode support using theme context (data-color-mode)
    checked: false
  - index: 11
    text: >-
      Preserve existing placeholder text for each component (docs: 'Write your
      documentation here...', decisions: 'Write your decision documentation
      here...')
    checked: false
  - index: 12
    text: >-
      Test that save/cancel functionality works identically to current
      implementation
    checked: false
  - index: 13
    text: Use Toast UI Viewer for markdown preview across components
    checked: false
  - index: 14
    text: >-
      Bundle Toast UI CSS (light+dark) under src/web/styles; integrate with
      ThemeContext; no CDN
    checked: false
  - index: 15
    text: 'Persist markdown only; in WYSIWYG, save via editor.getMarkdown()'
    checked: false
  - index: 16
    text: 'Set usageStatistics: false and sanitize rendered HTML in preview/viewer'
    checked: false
  - index: 17
    text: >-
      Define image handling: disable uploads or allow external URLs only;
      document behavior
    checked: false
  - index: 18
    text: Lazy-load editor and its CSS in edit mode; keep preview lightweight
    checked: false
  - index: 19
    text: Ensure code block syntax highlighting on par with current implementation
    checked: false
  - index: 20
    text: Decisions remain preview-only; do not enable editing
    checked: false
  - index: 21
    text: >-
      Refactor styling to align with the current design system; avoid preserving
      legacy CSS class names; maintain visual parity without coupling to old
      class structures
    checked: false
  - index: 22
    text: >-
      Provide a clear, accessible control to switch between Markdown and WYSIWYG
      while editing; discoverable, labeled, and keyboard accessible
    checked: false
definition_of_done: []
comments: []
---

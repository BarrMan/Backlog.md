---
task_schema_version: 2
id: BACK-119
title: Add documentation and decisions pages to web UI
status: Done
assignee: []
created_date: '2025-07-06'
updated_date: '2025-07-06'
labels: []
dependencies:
  - task-118
description: >-
  Implement dedicated pages for viewing and editing Documentation and Decisions
  in the web UI. Each page should display a list of markdown files with a
  beautiful rendered preview by default, and allow switching to an edit mode
  using the same markdown editor component used in task editing.
implementation_notes: >-
  - Created documentation listing page with responsive grid layout in
  `src/web/components/DocumentationList.tsx`

  - Created decisions listing page with grid layout and status filtering in
  `src/web/components/DecisionsList.tsx`

  - Implemented detail pages for viewing and editing both documents and
  decisions

  - Added create/edit functionality with markdown editor integration

  - Integrated with CLI commands for document and decision management via API
  endpoints

  - Implemented proper ID generation with cross-branch collision detection for
  decisions

  - Added all required API endpoints:
    - `/api/docs` - List all documentation files
    - `/api/docs/:filename` - Read/update specific documentation
    - `/api/decisions` - List all decision files
    - `/api/decisions/:id` - Read/update specific decisions
  - Used the existing markdown editor component from TaskForm for consistency

  - Added proper loading states and error handling throughout

  - Implemented search functionality for documentation files

  - Added status filtering for decisions (Proposed, Accepted, Rejected,
  Superseded)

  - Enhanced UI with proper spacing, transitions, and responsive design

  - Added metadata display including last modified dates and file information
acceptance_criteria:
  - index: 1
    text: List all markdown files from the `docs/` directory
    checked: true
  - index: 2
    text: Display file names as clickable items in a clean list/grid layout
    checked: true
  - index: 3
    text: Show rendered markdown content when a file is selected
    checked: true
  - index: 4
    text: Add "Edit" button that switches to edit mode
    checked: true
  - index: 5
    text: Use the same markdown editor component from task editing
    checked: true
  - index: 6
    text: Add "Save" and "Cancel" buttons in edit mode
    checked: true
  - index: 7
    text: Support creating new documentation files
    checked: true
  - index: 8
    text: Add search/filter functionality for documentation files
    checked: true
  - index: 9
    text: List all markdown files from the `decisions/` directory
    checked: true
  - index: 10
    text: 'Display decision files with ID, title, and date'
    checked: true
  - index: 11
    text: Show rendered markdown content for selected decisions
    checked: true
  - index: 12
    text: Add "Edit" button for switching to edit mode
    checked: true
  - index: 13
    text: Use the same markdown editor component from task editing
    checked: true
  - index: 14
    text: Add "Save" and "Cancel" buttons in edit mode
    checked: true
  - index: 15
    text: Support creating new decision files with auto-generated IDs
    checked: true
  - index: 16
    text: 'Add filtering by status (Proposed, Accepted, Rejected, Superseded)'
    checked: true
  - index: 17
    text: Add `/api/docs` endpoint for listing documentation files
    checked: true
  - index: 18
    text: 'Add `/api/docs/:filename` endpoint for reading/updating documentation'
    checked: true
  - index: 19
    text: Add `/api/decisions` endpoint for listing decision files
    checked: true
  - index: 20
    text: 'Add `/api/decisions/:id` endpoint for reading/updating decisions'
    checked: true
definition_of_done: []
comments: []
---
## Technical Notes

- Reuse the existing markdown editor component from TaskForm
- Implement proper syntax highlighting for code blocks in rendered markdown
- Consider using a markdown parsing library like marked or remark
- Add loading states while fetching file contents
- Implement error handling for file operations
- Consider adding a breadcrumb navigation for better UX
- Files should be displayed with metadata (last modified, file size)

## Acceptance Criteria
<!-- AC:BEGIN -->
### Documentation Page

### Decisions Page

### API Endpoints
<!-- AC:END -->
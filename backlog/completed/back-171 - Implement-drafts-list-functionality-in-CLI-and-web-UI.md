---
task_schema_version: 2
id: BACK-171
title: Implement drafts list functionality in CLI and web UI
status: Done
assignee:
  - '@claude'
created_date: '2025-07-12'
updated_date: '2025-07-16'
labels: []
dependencies: []
description: >-
  Add draft list functionality and promote draft actions to CLI and web UI.
  Include /api/drafts endpoint to web server to properly display drafts from
  backlog/drafts/ folder and enable promoting drafts to tasks.
implementation_notes: >-
  ### Analysis

  Found that most of the draft functionality was already implemented in the
  filesystem layer:

  - Draft operations: listDrafts, loadDraft, createDraft, promoteDraft,
  archiveDraft

  - CLI commands: create, archive, promote, view (but missing list)

  - DraftsList component existed but was filtering by status instead of reading
  from drafts folder


  ### Implementation

  1. **CLI draft list command** - Added full list command with plain text and
  interactive UI support

  2. **API Endpoints**:
     - `/api/drafts` - Returns all drafts from the filesystem
     - `/api/drafts/:id/promote` - Promotes a draft to a task
  3. **Web UI Updates**:
     - Updated DraftsList to fetch from `/api/drafts` instead of filtering tasks by status
     - Added a "Promote to Task" button for each draft with proper event handling
     - Maintained existing UI patterns and dark mode support

  ### Technical Details

  - Used existing filesystem methods for all operations

  - Followed existing patterns for CLI commands and API endpoints

  - Maintained consistency with existing UI components and styling

  - All acceptance criteria have been met and tested
acceptance_criteria:
  - index: 1
    text: CLI draft list command displays all drafts from backlog/drafts/ folder
    checked: true
  - index: 2
    text: CLI draft promote command moves draft from drafts/ to tasks/ folder
    checked: true
  - index: 3
    text: Web UI /api/drafts endpoint returns drafts from filesystem
    checked: true
  - index: 4
    text: 'Web UI /api/drafts/:id/promote endpoint promotes draft to task'
    checked: true
  - index: 5
    text: Web UI drafts page shows actual draft files with proper navigation
    checked: true
  - index: 6
    text: Web UI drafts page includes promote action button for each draft
    checked: true
  - index: 7
    text: Drafts are read from folder location not filtered by status field
    checked: true
  - index: 8
    text: Promoted drafts appear in tasks list and disappear from drafts list
    checked: true
definition_of_done: []
comments: []
---

---
task_schema_version: 2
id: BACK-345.08
title: Add draft prefix migration on config load
status: Done
assignee:
  - '@codex'
created_date: '2026-01-03 20:56'
updated_date: '2026-01-05 12:46'
labels:
  - enhancement
  - migration
  - drafts
dependencies:
  - task-345.01
  - task-345.03
parent_task_id: task-345
priority: medium
description: >-
  ### Overview

  When loading a project config that doesn't have a `prefixes:` section, run a
  one-time migration to:

  1. Add the prefixes section to config.yml

  2. Rename existing `task-*.md` files in the drafts folder to `draft-*.md`

  3. Update IDs inside those files using `generateNextId("draft")`


  ### Key Files

  - **New:** `src/core/prefix-migration.ts` - Migration logic (separate file)

  - **Modify:** `src/core/backlog.ts` - Call migration on config load


  ### Implementation

  1. Create `migrateDraftPrefixes(fs: FileSystem)` function in separate file

  2. Scan drafts folder for `task-*.md` files

  3. For each file:
     - Generate new draft ID using `generateNextDraftId()`
     - Update the ID in the file content (frontmatter)
     - Rename the file to use `draft-` prefix
  4. Add `prefixes: { task: "task", draft: "draft" }` to config.yml

  5. Call migration from Core when config is loaded and missing prefixes section


  ### Tests (in same PR)

  - Test migration creates prefixes section

  - Test migration renames task- files to draft- in drafts folder

  - Test migration updates IDs inside files

  - Test migration is idempotent (doesn't run twice)

  - Test migration handles empty drafts folder


  ### Docs (in same PR)

  - Document migration behavior

  - Add note in release notes about automatic migration
acceptance_criteria:
  - index: 1
    text: Migration runs automatically when prefixes section missing from config
    checked: false
  - index: 2
    text: Migration adds prefixes section to config.yml
    checked: false
  - index: 3
    text: Migration renames task-*.md to draft-*.md in drafts folder
    checked: false
  - index: 4
    text: Migration updates IDs inside files to use draft- prefix
    checked: false
  - index: 5
    text: Migration is idempotent (safe to run multiple times)
    checked: false
  - index: 6
    text: Migration logic in separate file (prefix-migration.ts)
    checked: false
  - index: 7
    text: Tests verify all migration scenarios
    checked: false
definition_of_done: []
comments: []
---

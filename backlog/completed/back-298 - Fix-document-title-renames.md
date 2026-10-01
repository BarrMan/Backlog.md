---
task_schema_version: 2
id: BACK-298
title: Fix document title renames
status: Done
assignee:
  - '@codex'
created_date: '2025-10-16 17:51'
updated_date: '2025-10-16 19:55'
labels: []
dependencies: []
description: >-
  Document updates currently mutate the cached document and rewrite using the
  new title without removing the previous file, leaving duplicate markdown files
  on rename.

  Ensure the server updates document titles safely and filesystem writes handle
  renames atomically.
implementation_plan: >-
  1. Update the document update endpoint to accept JSON payloads, clone the
  fetched document, and apply title/content changes before persistence.

  2. Extend filesystem.saveDocument to detect filename changes (including
  subdirectories), remove/rename stale files for the same doc id, and then write
  the new content.

  3. Ensure the content store refreshes documents only after a successful write
  so the cache stays in sync.

  4. Add regression tests covering title rename flows (server + filesystem) and
  verifying the old file is removed.
implementation_notes: >-
  - Updated document update flow to accept JSON payloads, clone the in-memory
  record, and persist via `core.updateDocument` without mutating cache on
  failure.

  - Reworked filesystem document writes to track relative paths, perform rename
  semantics, and prune stale duplicates so Git detects renames.

  - Added regression tests covering filesystem cleanup, git rename detection,
  and relative-path metadata to guard against future regressions.

  - Verified with targeted test runs (`bun test src/test/filesystem.test.ts
  src/test/core.test.ts`) and manual rename, staging shows `R` status.
acceptance_criteria:
  - index: 1
    text: >-
      Updating a document title through the web UI results in a single markdown
      file whose name matches the new title.
    checked: true
  - index: 2
    text: >-
      Document updates accept JSON payloads with optional title data and avoid
      mutating the in-memory store unless the write succeeds.
    checked: true
  - index: 3
    text: >-
      Add automated coverage (unit or integration) that fails if an old document
      file remains after a title change.
    checked: true
definition_of_done: []
comments: []
---

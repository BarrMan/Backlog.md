---
task_schema_version: 2
id: BACK-271
title: Fix acceptance criteria section removal when list emptied
status: Done
assignee:
  - '@codex'
created_date: '2025-09-17 21:21'
updated_date: '2025-09-18 16:39'
labels: []
dependencies: []
description: >-
  Codex review on PR 358 notes that serializer only updates the
  acceptance-criteria section when the in-memory list has entries. After
  removing every acceptance criterion via the CLI the markdown still keeps the
  old section. Update the serializer so it runs even with an empty list and
  verify the CLI flow cleans up the section.
implementation_notes: >-
  Serializer now updates even when acceptanceCriteriaItems is empty.

  Added regression tests covering serializer and CLI removal flow.

  Validated with bun test.


  Restored guard to avoid stripping legacy/freeform acceptance criteria and
  added regression coverage for that case.
acceptance_criteria:
  - index: 1
    text: >-
      Serializer updates the acceptance criteria section even when the list is
      empty, removing the block from the task file.
    checked: true
  - index: 2
    text: >-
      Add or update automated coverage to confirm removing all acceptance
      criteria leaves no acceptance-criteria section in saved markdown.
    checked: true
  - index: 3
    text: >-
      Verify backlog task edit removing all acceptance criteria no longer leaves
      stale content.
    checked: true
definition_of_done: []
comments: []
---

---
task_schema_version: 2
id: BACK-600
title: Key document and decision writes on frontmatter identity
status: To Do
assignee: []
created_date: '2026-08-07 23:57'
labels:
  - core
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/issues/846'
priority: medium
type: bug
ordinal: 239000
description: >-
  Follow-up to BACK-580 (#846 lineage). Reads now key document and decision
  identity on the frontmatter `id:`, but the save-side duplicate cleanup still
  keys on the filename prefix, so writes and reads disagree about which file an
  ID owns.


  Two concrete consequences:


  (a) Pre-existing on main and unchanged by BACK-580. Given a file
  `backlog/docs/nested/doc-2 - Shadow.md` whose frontmatter says `id: doc-99`,
  running `backlog doc update doc-2` silently DELETES that shadow file even
  though it is a frontmatter-unique document. The removal loop in `saveDocument`
  matches candidates by splitting the filename on " - " and comparing the
  leading token, so it claims files that frontmatter says belong to a different
  document (src/file-system/operations.ts, saveDocument, roughly lines
  1006-1044).


  (b) Newly reachable after BACK-580 but fail-safe. Updating a decision whose
  filename prefix does not match its frontmatter ID now writes a new file,
  leaves the old file in place, and manufactures a duplicate ID that `backlog
  doctor` then reports. Nothing is lost and the collision is visible, but the
  write should not create the collision in the first place.


  Fix direction: save-side cleanup should locate source files by frontmatter
  identity rather than by filename prefix. `Document.path` and `Decision.path`
  now exist for exactly this and are populated by
  `listDocuments`/`listDecisions`. Separately, `backlog doctor` should flag
  files whose filename prefix disagrees with their frontmatter ID, since that
  mismatch is the condition that makes both cases possible.
acceptance_criteria:
  - index: 1
    text: >-
      Saving a document never deletes a file whose frontmatter ID differs from
      the target document ID
    checked: false
  - index: 2
    text: >-
      Saving a decision never creates a second file for an ID that already
      exists under a different filename
    checked: false
  - index: 3
    text: >-
      backlog doctor reports files whose filename prefix disagrees with their
      frontmatter ID
    checked: false
  - index: 4
    text: >-
      Tests cover the shadow-file deletion case, the decision
      filename/frontmatter mismatch case, and the new doctor finding
    checked: false
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: false
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: false
  - index: 3
    text: bun test (or scoped test) passes
    checked: false
comments: []
---

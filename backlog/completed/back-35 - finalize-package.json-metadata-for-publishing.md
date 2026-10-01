---
task_schema_version: 2
id: BACK-35
title: Finalize package.json metadata for publishing
status: Done
assignee:
  - '@codex'
created_date: '2025-06-09'
updated_date: '2025-06-10'
labels: []
dependencies: []
description: Add full author and repository information to package.json for npm publishing.
acceptance_criteria:
  - index: 1
    text: '`author` field defined'
    checked: true
  - index: 2
    text: '`repository` URL set'
    checked: true
  - index: 3
    text: '`bugs` URL set'
    checked: true
  - index: 4
    text: '`homepage` field set'
    checked: true
  - index: 5
    text: '`keywords` array includes relevant terms'
    checked: true
  - index: 6
    text: '`license` field confirmed'
    checked: true
  - index: 7
    text: '`npm publish --dry-run` succeeds with no warnings'
    checked: true
definition_of_done: []
comments: []
---

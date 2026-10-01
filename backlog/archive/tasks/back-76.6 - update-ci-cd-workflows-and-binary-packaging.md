---
task_schema_version: 2
id: BACK-76.6
title: Update CI/CD workflows and binary packaging
status: Won't Do
assignee: []
created_date: '2025-06-16'
labels:
  - ci-cd
  - deployment
  - infrastructure
dependencies: []
parent_task_id: task-76
description: >-
  Update CI/CD workflows and binary packaging processes to ensure they work
  correctly with the new neo-neo-blessed ESM-based implementation.


  This involves:

  - Updating GitHub Actions workflows

  - Ensuring binary compilation works with ESM modules

  - Verifying cross-platform binary generation

  - Testing binary distribution and installation

  - Updating any deployment scripts
acceptance_criteria:
  - index: 1
    text: Update GitHub Actions workflows to handle ESM builds
    checked: false
  - index: 2
    text: >-
      Ensure binary compilation succeeds on all platforms (Windows, macOS,
      Linux)
    checked: false
  - index: 3
    text: Verify generated binaries include neo-neo-blessed correctly
    checked: false
  - index: 4
    text: Test binary size and ensure tree shaking is effective
    checked: false
  - index: 5
    text: Update npm packaging scripts if needed
    checked: false
  - index: 6
    text: Test installation via npm/bun on all platforms
    checked: false
  - index: 7
    text: Verify standalone binaries work without node_modules
    checked: false
  - index: 8
    text: Update release workflow to package new binaries
    checked: false
  - index: 9
    text: Test auto-update mechanism with new binaries
    checked: false
  - index: 10
    text: Document any changes to release process
    checked: false
  - index: 11
    text: Ensure CI tests pass with neo-neo-blessed
    checked: false
definition_of_done: []
comments: []
---
## Migration Cancellation Note

This task has been cancelled. After assessment (task 76.1), it was determined that neo-neo-blessed does not support ESM modules, which contradicts its main selling point. The migration to neo-neo-blessed has been abandoned in favor of continuing with the current blessed implementation.
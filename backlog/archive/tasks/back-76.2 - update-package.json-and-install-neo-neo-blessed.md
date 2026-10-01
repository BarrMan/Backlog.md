---
task_schema_version: 2
id: BACK-76.2
title: Update package.json and install neo-neo-blessed
status: Won't Do
assignee: []
created_date: '2025-06-16'
labels:
  - dependencies
  - configuration
dependencies: []
parent_task_id: task-76
description: >-
  Update the project dependencies to replace blessed with neo-neo-blessed and
  ensure proper installation and configuration.


  This task involves:

  - Removing the blessed dependency from package.json

  - Adding neo-neo-blessed as a dependency

  - Updating any related dev dependencies if needed

  - Ensuring the package-lock/bun.lockb is updated

  - Verifying the installation works correctly
acceptance_criteria:
  - index: 1
    text: Remove `blessed` from package.json dependencies
    checked: false
  - index: 2
    text: Add `neo-neo-blessed` to package.json with appropriate version
    checked: false
  - index: 3
    text: Run `bun install` and ensure it completes successfully
    checked: false
  - index: 4
    text: Verify neo-neo-blessed is properly installed in node_modules
    checked: false
  - index: 5
    text: Update any type definitions if neo-neo-blessed provides its own
    checked: false
  - index: 6
    text: Ensure no peer dependency conflicts exist
    checked: false
  - index: 7
    text: Commit updated package.json and lock file
    checked: false
  - index: 8
    text: Document the version of neo-neo-blessed being used
    checked: false
definition_of_done: []
comments: []
---
## Migration Cancellation Note

This task has been cancelled. After assessment (task 76.1), it was determined that neo-neo-blessed does not support ESM modules, which contradicts its main selling point. The migration to neo-neo-blessed has been abandoned in favor of continuing with the current blessed implementation.
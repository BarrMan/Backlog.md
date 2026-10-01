---
task_schema_version: 2
id: BACK-76.4
title: Update build system and remove CJS workarounds
status: Won't Do
assignee: []
created_date: '2025-06-16'
labels:
  - build
  - configuration
  - cleanup
dependencies: []
parent_task_id: task-76
description: >-
  Update the build system to fully leverage ESM modules and remove any
  CommonJS-specific workarounds that were required for the blessed library.


  This includes:

  - Updating build scripts to use ESM throughout

  - Removing CJS compatibility layers or polyfills

  - Optimizing bundler configuration for tree shaking

  - Updating TypeScript configuration for ESM output

  - Cleaning up any blessed-specific patches or scripts
acceptance_criteria:
  - index: 1
    text: Update bundler configuration to optimize for ESM and tree shaking
    checked: false
  - index: 2
    text: Remove `patch-blessed.js` script if no longer needed
    checked: false
  - index: 3
    text: Update TypeScript config to output pure ESM modules
    checked: false
  - index: 4
    text: Remove any CJS polyfills or compatibility code
    checked: false
  - index: 5
    text: Update build script in package.json for ESM compilation
    checked: false
  - index: 6
    text: Ensure compiled binaries work correctly with ESM modules
    checked: false
  - index: 7
    text: Verify bundle size reduction through tree shaking
    checked: false
  - index: 8
    text: Update any import resolution configurations
    checked: false
  - index: 9
    text: Clean up scripts/cli.cjs if using CJS workarounds
    checked: false
  - index: 10
    text: Document build process changes
    checked: false
definition_of_done: []
comments: []
---
## Migration Cancellation Note

This task has been cancelled. After assessment (task 76.1), it was determined that neo-neo-blessed does not support ESM modules, which contradicts its main selling point. The migration to neo-neo-blessed has been abandoned in favor of continuing with the current blessed implementation.
---
task_schema_version: 2
id: BACK-232
title: Nix build fails due to missing libstdc++.so.6
status: Done
assignee: []
created_date: '2025-08-17 11:15'
updated_date: '2025-08-17 11:27'
labels: []
dependencies: []
description: >-
  Building `backlog-md` with Nix (`nix build`) fails during the CSS build step.

  The error occurs when `bun run build:css` loads the `@parcel/watcher` native
  addon, which cannot find `libstdc++.so.6`.


  ### Steps to reproduce the behavior


  1. Clone this repository

  2. Run `nix build`


  ### Error excerpt


  ```

  error: libstdc++.so.6: cannot open shared object file: No such file or
  directory
    code: "ERR_DLOPEN_FAILED"

        at <anonymous> (/build/.../node_modules/@parcel/watcher/index.js:15:13)

  Bun v1.2.18 (Linux x64)

  error: script "build:css" exited with code 1

  ```


  ### Expected behavior


  The Nix build should succeed without missing library errors.


  ### Environment


  - OS: `NixOS 25.05`

  - Node version: `20`
acceptance_criteria:
  - index: 1
    text: '`nix build` completes successfully'
    checked: true
  - index: 2
    text: '`bun run build` completes successfully inside nix development shell'
    checked: true
definition_of_done: []
comments: []
---

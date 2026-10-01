---
task_schema_version: 2
id: BACK-340
title: Fix nix build by pinning bun2nix to V1
status: Done
assignee:
  - '@codex'
created_date: '2025-12-08 22:17'
updated_date: '2025-12-08 22:17'
labels:
  - nix
  - bug
  - infrastructure
dependencies: []
priority: high
description: >-
  Fix the nix build that broke in commit 27b1943d (TASK-322) by pinning bun2nix
  to the V1 version.


  ## Background

  Commit 27b1943d regenerated `bun.nix` with the V2 format (function-based)
  while the `flake.nix` was still using the V1 API (`mkBunDerivation`). This
  caused the build to fail with:

  ```

  error: expected a set but found a function: «lambda @ .../bun.nix:8:1»

  ```


  ## Root Cause

  - V1 bun.nix format: plain attribute set `{ "@pkg/name" = { ... }; }`

  - V2 bun.nix format: function `{ fetchurl, ... }: { "@pkg/name" = fetchurl {
  ... }; }`

  - The `flake.nix` uses `mkBunDerivation` which expects V1 format


  ## Solution

  Pin bun2nix to revision `85d692d68a5345d868d3bb1158b953d2996d70f7` which
  produces the V1 format compatible with our current `flake.nix`.
acceptance_criteria:
  - index: 1
    text: 'bun.nix uses V1 format (plain attribute set, not function)'
    checked: true
  - index: 2
    text: scripts/update-nix.sh pins bun2nix to V1 revision
    checked: true
  - index: 3
    text: package.json postinstall pins bun2nix to V1 revision
    checked: true
  - index: 4
    text: nix build succeeds on Darwin
    checked: true
  - index: 5
    text: 'Built binary works (--version, task list, browser)'
    checked: true
definition_of_done: []
comments: []
---

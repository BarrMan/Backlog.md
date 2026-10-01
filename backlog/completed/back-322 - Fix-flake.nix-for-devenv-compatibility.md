---
task_schema_version: 2
id: BACK-322
title: Fix flake.nix for devenv compatibility
status: Done
assignee: []
created_date: '2025-11-29 18:50'
updated_date: '2025-11-29 21:16'
labels:
  - nix
  - bug-fix
dependencies: []
priority: medium
description: >-
  Fix the Nix flake so the `backlog` command works correctly when used as a
  devenv.sh input.


  **Problem:**

  PR #419 reported that when using the flake package in devenv.sh, running
  `backlog` executes the bare `bun` binary instead of the actual CLI tool. This
  happens because the package name (`pname`) doesn't match the binary name.


  **Solution:**

  - Change `pname` from `"backlog-md"` to `"backlog"` to match the output binary
  name

  - Remove unnecessary `bun run build:css` step (CSS is pre-compiled and
  committed to git)


  **Reference:**

  - [PR #419](https://github.com/MrLesk/Backlog.md/pull/419)
implementation_plan: |-
  ## Changes

  ### flake.nix

  1. Change `pname` to match binary name:
  ```nix
  pname = "backlog";  # was "backlog-md"
  ```

  2. Remove CSS build step (already pre-compiled in git):
  ```nix
  buildPhase = ''
    runHook preBuild

    # Build the CLI tool with embedded version
    # Note: CSS is pre-compiled and committed to git, no need to build here
    bun build --compile --minify --define "__EMBEDDED_VERSION__=${version}" --outfile=dist/backlog src/cli.ts

    runHook postBuild
  '';
  ```

  ## Testing

  1. `nix build` - verify binary works: `./result/bin/backlog --version`
  2. `nix develop` - verify dev shell has bun, git, biome
  3. `bun test` - ensure no regressions
implementation_notes: |-
  <!-- SECTION:NOTES:BEGIN -->
  <!-- SECTION:NOTES:END -->
acceptance_criteria:
  - index: 1
    text: The `pname` in flake.nix is set to `"backlog"` to match the binary name
    checked: true
  - index: 2
    text: 'The unnecessary `bun run build:css` step is removed from buildPhase'
    checked: true
  - index: 3
    text: >-
      The x86_64-linux baseline Bun overlay for older CPUs (issue #412) is
      preserved
    checked: true
  - index: 4
    text: '`nix build` produces a working `backlog` binary'
    checked: true
  - index: 5
    text: The flake package works correctly when used as a devenv input
    checked: true
  - index: 6
    text: '`nix develop` shell continues to work with all expected tooling'
    checked: true
  - index: 7
    text: All existing tests pass
    checked: true
definition_of_done: []
comments: []
---

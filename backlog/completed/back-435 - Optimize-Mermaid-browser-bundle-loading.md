---
task_schema_version: 2
id: BACK-435
title: Optimize Mermaid browser bundle loading
status: Done
assignee:
  - '@alex-agent'
created_date: '2026-04-25 17:10'
updated_date: '2026-04-25 17:18'
labels:
  - web
  - dependencies
dependencies: []
references:
  - >-
    /Users/alex/projects/Backlog.md-main-mess-backup-20260425-1708/remaining-mermaid-package-against-origin-main.patch
documentation:
  - backlog/completed/back-317 - Add-Mermaid-diagram-rendering-in-web-UI.md
priority: medium
description: >-
  The web UI currently lazy-loads Mermaid through the package entry point, which
  can make the browser bundle traverse Mermaid's parser dependency graph. Use
  Mermaid's prebuilt browser ESM bundle instead, and refresh only the
  package/build artifacts needed for that optimization. This work should stay
  separate from the already-merged MCP roots changes and should not include
  unrelated feature work.
implementation_plan: >-
  1. Commit the BACK-435 task file directly to main so the task id is reserved
  before code work.

  2. Create a feature branch from current origin/main.

  3. Apply the saved clean Mermaid/package patch from the backup folder.

  4. Verify the diff contains only the task, Mermaid import/type shim,
  package/lock/Nix refresh, and generated CSS.

  5. Run focused Mermaid tests, typecheck, Biome check, and relevant build
  validation.

  6. Finalize the task, open a PR titled `BACK-435 - Optimize Mermaid browser
  bundle loading`, wait for checks/Codex review, and merge if green.
implementation_notes: >-
  Applied the saved Mermaid/package patch onto a clean branch from current main,
  keeping the diff limited to the Mermaid dynamic import, a type declaration for
  Mermaid's prebuilt ESM bundle, package/lock/Nix dependency artifacts, Biome
  schema, and generated Tailwind CSS. Verified the patch does not include any
  MCP roots server or test changes. The dependency refresh is broader than
  Mermaid alone because the saved package bump updates related web/tooling
  packages; package.json, bun.lock, bun.nix, and generated CSS are internally
  consistent.


  Validation passed: bun install --frozen-lockfile, bun test
  src/test/mermaid.test.ts src/test/mermaid-markdown.test.tsx, bunx tsc
  --noEmit, bun run check ., bun run build, full bun test, and bun run
  update-nix through the repo's Docker-based bun2nix path. Biome 2.4.12 reports
  existing optional-chain warnings in unrelated files but exits successfully. A
  full nix build was not run in this environment.
final_summary: >-
  Summary:

  - Switched the web Mermaid loader to import Mermaid's prebuilt browser ESM
  bundle (`mermaid/dist/mermaid.esm.mjs`) so the CLI browser build does not
  traverse Mermaid's parser dependency graph through the generic package entry
  point.

  - Added a local TypeScript declaration for the prebuilt Mermaid bundle import.

  - Refreshed Mermaid and related package/tooling artifacts, including
  package.json, bun.lock, bun.nix, Biome schema, and generated Tailwind CSS.


  Validation:

  - bun install --frozen-lockfile

  - bun test src/test/mermaid.test.ts src/test/mermaid-markdown.test.tsx

  - bunx tsc --noEmit

  - bun run check .

  - bun run build

  - bun test

  - bun run update-nix


  Note: bun.nix was regenerated through the repo's Docker-based bun2nix script.
  A full nix build was not run locally.
acceptance_criteria:
  - index: 1
    text: >-
      Mermaid rendering in the web UI loads the prebuilt browser ESM bundle
      instead of the generic package entry point.
    checked: true
  - index: 2
    text: >-
      TypeScript has an explicit declaration for the prebuilt Mermaid bundle
      import.
    checked: true
  - index: 3
    text: >-
      Package, lockfile, and generated Nix dependency artifacts are consistent
      with the Mermaid/package refresh.
    checked: true
  - index: 4
    text: Generated web CSS is updated only as required by the package refresh.
    checked: true
  - index: 5
    text: Existing Mermaid markdown/rendering tests continue to pass.
    checked: true
  - index: 6
    text: >-
      The PR does not reintroduce the already-merged MCP roots server/test
      changes.
    checked: true
definition_of_done:
  - index: 1
    text: bunx tsc --noEmit passes when TypeScript touched
    checked: true
  - index: 2
    text: bun run check . passes when formatting/linting touched
    checked: true
  - index: 3
    text: bun test (or scoped test) passes
    checked: true
comments: []
---

---
task_schema_version: 2
id: BACK-345.01
title: Create PrefixConfig abstraction layer
status: Done
assignee:
  - '@codex'
created_date: '2026-01-03 20:43'
updated_date: '2026-01-03 20:56'
labels:
  - enhancement
  - refactor
  - id-generation
dependencies: []
parent_task_id: task-345
priority: high
description: >-
  ### Overview

  Create the foundational abstraction layer for configurable ID prefixes. This
  is the core building block that all other subtasks depend on.


  ### Key Files

  - **New:** `src/utils/prefix-config.ts` - Core abstraction

  - **Modify:** `src/types/index.ts` - Add types

  - **Modify:** `src/core/backlog.ts` - Load prefix config


  ### Implementation

  1. Define `PrefixConfig` interface with `task` and `draft` prefix fields

  2. Add config schema to `BacklogConfig` type

  3. Create helper functions:
     - `getDefaultPrefixConfig()` - Returns `{ task: "task", draft: "draft" }`
     - `normalizeId(id: string, prefix: string)` - Generic ID normalization
     - `extractIdNumber(id: string, prefix: string)` - Extract numeric part
     - `buildGlobPattern(prefix: string)` - Returns `${prefix}-*.md`
     - `buildIdRegex(prefix: string)` - Returns regex for ID matching
  4. Load prefix config in Core initialization with defaults


  ### Tests (in same PR)

  - Unit tests for all helper functions

  - Test default config loading

  - Test custom config loading

  - Test backward compatibility (missing config = defaults)


  ### Docs (in same PR)

  - JSDoc for all exported functions

  - Update config.yml schema documentation
implementation_notes: |-
  Completed implementation:
  - Added PrefixConfig interface to src/types/index.ts
  - Added prefixes field to BacklogConfig
  - Created src/utils/prefix-config.ts with all helper functions
  - Created src/test/prefix-config.test.ts with 52 unit tests
  - All tests pass, TypeScript compiles
acceptance_criteria:
  - index: 1
    text: PrefixConfig interface defined with task and draft fields
    checked: true
  - index: 2
    text: >-
      Helper functions created: normalizeId, extractIdNumber, buildGlobPattern,
      buildIdRegex
    checked: true
  - index: 3
    text: 'Default config returns { task: "task", draft: "draft" }'
    checked: true
  - index: 4
    text: Config loads from backlog/config.yml with fallback to defaults
    checked: true
  - index: 5
    text: Unit tests cover all helper functions
    checked: true
  - index: 6
    text: JSDoc documentation added for all exports
    checked: true
definition_of_done: []
comments: []
---

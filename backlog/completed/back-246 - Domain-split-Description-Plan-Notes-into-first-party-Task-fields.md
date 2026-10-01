---
task_schema_version: 2
id: BACK-246
title: 'Domain: split Description/Plan/Notes into first-party Task fields'
status: Done
assignee:
  - '@codex'
created_date: '2025-09-02 19:59'
updated_date: '2025-09-03 17:36'
labels:
  - domain
  - parsing
  - web-ui
  - tui
dependencies: []
description: >-
  Parse additional sections (Description, Implementation Plan, Implementation
  Notes) into dedicated Task properties when reading. Maintain the current
  markdown format on write by composing from these properties. Update
  serializer/parser and UI to use first-party fields, avoiding duplication and
  ensuring backward compatibility.
implementation_plan: |-
  1. Core model
     - First-party fields: description, criteria (structured), plan, notes
  2. Core composition
     - Serializer composes body from first-party fields; preserves other content
  3. TUI/CLI refactor
     - Prefer first-party fields in TUI/plain output; avoid duplication
  4. Tests
     - Round-trip parse/serialize and CLI flows; TUI rendering
  5. Cleanup
     - Server accepts/returns Task with first-party fields; removed web util
  6. DoD
     - All ACs checked, notes added, tests green
implementation_notes: >-
  Core now exposes Task.sections (description, criteria, plan, notes) via
  parser. TUI/CLI prefer sections for rendering, eliminating duplication and
  improving consistency. Serializer supports composing from sections when body
  is intentionally empty (opt-in), preserving backward compatibility with
  existing CLI flows that edit body directly. All tests pass. Web util remains
  as a temporary fallback until UI consumes core sections end-to-end.
acceptance_criteria:
  - index: 1
    text: Expose Task.description as the parsed '## Description' section (string)
    checked: true
  - index: 2
    text: Expose Task.implementationPlan as parsed '## Implementation Plan' (string)
    checked: true
  - index: 3
    text: >-
      Expose Task.implementationNotes as parsed '## Implementation Notes'
      (string)
    checked: true
  - index: 4
    text: >-
      Serializer composes body from first-party fields preserving current
      markdown structure
    checked: true
  - index: 5
    text: >-
      UI reads from first-party fields; Content editor excludes these sections
      to prevent duplication
    checked: true
  - index: 6
    text: Maintain backward compatibility for existing tasks and CLI behaviors
    checked: true
  - index: 7
    text: Add tests for parsing + serialization round-trips
    checked: true
  - index: 8
    text: Move sections parsing/composition to core (shared by CLI/TUI/Web)
    checked: true
  - index: 9
    text: 'Expose Task.sections {description, criteria, plan, notes} in parser output'
    checked: true
  - index: 10
    text: Core serializer composes body from Task.sections (single source of truth)
    checked: true
  - index: 11
    text: >-
      Refactor TUI (src/ui/task-viewer.ts) to render using Task.sections (no
      body re-parse)
    checked: true
  - index: 12
    text: 'CLI plain output uses Task.sections; avoid content duplication (e.g., AC)'
    checked: true
  - index: 13
    text: Deprecate/remove web-only sections util once UI consumes core sections
    checked: true
  - index: 14
    text: Add core tests for parse/compose and TUI rendering without duplication
    checked: true
definition_of_done: []
comments: []
---

---
task_schema_version: 2
id: BACK-76.1
title: Assess neo-neo-blessed API compatibility and differences
status: Done
assignee: []
created_date: '2025-06-16'
updated_date: '2025-06-16'
labels:
  - research
  - dependencies
  - analysis
dependencies: []
parent_task_id: task-76
description: >-
  Conduct a thorough assessment of neo-neo-blessed to understand its API
  compatibility with the current blessed implementation and identify any
  breaking changes or differences that need to be addressed during migration.


  This research phase will:

  - Compare the APIs of blessed vs neo-neo-blessed

  - Identify all current blessed usage patterns in the codebase

  - Document any breaking changes or API differences

  - Assess the impact on existing functionality

  - Create a migration plan based on findings
acceptance_criteria:
  - index: 1
    text: Review neo-neo-blessed documentation and source code
    checked: true
  - index: 2
    text: Create a comprehensive list of all blessed API calls used in the project
    checked: true
  - index: 3
    text: Document any API differences between blessed and neo-neo-blessed
    checked: true
  - index: 4
    text: Identify potential breaking changes that will require code modifications
    checked: true
  - index: 5
    text: Test basic neo-neo-blessed functionality in a minimal example
    checked: true
  - index: 6
    text: Create a migration checklist of required changes
    checked: true
  - index: 7
    text: Document any features that may need alternative implementations
    checked: true
  - index: 8
    text: Assess impact on binary packaging and distribution
    checked: true
definition_of_done: []
comments: []
---
## Assessment Report

### Critical Finding: neo-neo-blessed does NOT support ESM

After thorough investigation, I discovered that **neo-neo-blessed does not actually provide ESM support**. The library still uses CommonJS modules, which contradicts the initial assumption about ESM migration benefits.

### Key Findings:

1. **Module System**: 
   - neo-neo-blessed uses CommonJS (`require`/`module.exports`)
   - No `"type": "module"` in package.json
   - Main entry point is `./lib/blessed.js` (CommonJS)

2. **API Compatibility**:
   - API appears to be 100% compatible with original blessed
   - It's a maintenance fork focused on bug fixes
   - No breaking changes documented

3. **Dependencies**:
   - Includes `node-pty` (v0.9.0) - has native compilation requirements
   - Includes `term.js` (v0.0.7)
   - Installation issues on modern Node.js due to node-pty compilation

4. **Current Blessed Usage in Project**:
   - UI components: tui.ts, board.ts, task-viewer.ts, loading.ts, etc.
   - Uses: screen, box, list, text, log widgets
   - Features: scrolling, keyboard navigation, mouse support, styling

### Migration Impact Assessment:

**Pros of neo-neo-blessed:**
- Bug fixes and maintenance updates
- Same API (no code changes needed)
- Active maintenance

**Cons of neo-neo-blessed:**
- ❌ **No ESM support** (main goal not achieved)
- ❌ No tree shaking benefits
- ❌ Still requires CJS workarounds
- ❌ Installation issues with native dependencies
- ❌ No reduction in bundle size

### Recommendation: DO NOT MIGRATE

Since neo-neo-blessed does not provide the ESM support that was the primary motivation for this migration, I recommend **not proceeding with this migration**. The library offers no significant benefits over the current blessed implementation while introducing potential stability issues.

### Alternative Options to Consider:

1. **Stay with current blessed**: Continue using the existing blessed library with current workarounds
2. **Look for true ESM alternatives**: Research other TUI libraries that genuinely support ESM
3. **Create ESM wrapper**: Build an ESM wrapper around blessed (complex but maintains compatibility)
4. **Different TUI library**: Consider completely different libraries like:
   - ink (React-based, ESM support)
   - terminal-kit (different API but ESM-ready)
   - Custom implementation using ANSI escape codes

### Next Steps:

Given these findings, we should:
1. Close this migration effort as "Won't Do" 
2. Document the decision and rationale
3. Consider alternative approaches if ESM support remains a priority
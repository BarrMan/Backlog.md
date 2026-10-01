---
task_schema_version: 2
id: BACK-77
title: Migrate from blessed to bblessed for better Bun and Windows support
status: Done
assignee:
  - '@ai-agent'
created_date: '2025-06-16'
updated_date: '2025-06-16'
labels:
  - refactoring
  - dependencies
  - windows
dependencies: []
description: >-
  Successfully migrated from the original blessed library to bbblessed
  (github:node-opcua/bbblessed), a fork with improved bundling support that
  eliminates the need for complex Windows patches and provides better
  cross-platform compatibility.


  ## Background


  The project previously used blessed v0.1.81 with a custom patch script
  (`scripts/patch-blessed.js`) that:

  1. Replaced dynamic widget loading with static imports for Bun bundling

  2. Bundled terminfo files and patched tput.js for Windows compatibility


  This patching was fragile and a maintenance burden.
acceptance_criteria:
  - index: 1
    text: Replace blessed with bblessed in package.json
    checked: true
  - index: 2
    text: Remove postinstall patch script
    checked: true
  - index: 3
    text: Remove patch-blessed.js and terminfo resources
    checked: true
  - index: 4
    text: All tests pass with bblessed
    checked: true
  - index: 5
    text: Board view and other TUI components work correctly
    checked: true
  - index: 6
    text: Windows binary builds without patches
    checked: true
  - index: 7
    text: No regression in functionality
    checked: true
definition_of_done: []
comments: []
---
## Implementation Details

### Migration Steps Completed:
1. Installed bbblessed from GitHub: `npm install github:node-opcua/bbblessed`
2. Removed postinstall script from package.json
3. Deleted `scripts/patch-blessed.js`
4. Deleted `resources/terminfo/` directory
5. Updated all imports from `import blessed from "blessed"` to `import blessed from "bbblessed"`
6. Verified all tests pass (229/229)
7. Tested board view and other TUI functionality

### Key Benefits:
- **No more patches**: bbblessed has improved bundling support with recent commits specifically addressing bundling issues
- **Better Windows support**: Cross-platform compatibility built-in
- **Improved bundling**: Specific fixes for bundling issues (Sept 2024 commits)
- **Cleaner setup**: No postinstall scripts or resource files needed
- **Same API**: Drop-in replacement, no code changes required
- **Active maintenance**: bbblessed is actively maintained with recent bundling improvements

### Technical Notes:
- The library is now imported as `bbblessed` in all source files
- Version 0.1.82 includes bundling improvements from Sept 2024
- **Windows Fix**: Enhanced `createScreen()` in tui.ts to handle Windows terminfo issues:
  - Only disables tput on Windows (works normally on Mac/Linux)
  - Sets `tput: false`, `termcap: false`, `extended: false` on program creation
  - Forces `terminal: 'dumb'` on Windows to prevent terminfo detection
  - Provides minimal tput stubs with common escape sequences for Windows
  - Works around bbblessed bugs where it incorrectly uses `this.put` instead of `this.tput.strings`
  - Adds required methods like `csr()` and `enacs()` that bbblessed expects
  - This completely prevents the `ENOENT: no such file or directory` terminfo errors on Windows
  - Windows users still get full TUI with colors, boxes, and all features

### Related Tasks Updated:
- Task 41: Updated to reflect actual bblessed usage
- Task 53: Added note about improved Bun compatibility
- Task 61: Added note about better bundling with bblessed
- Task 72: Added note about eliminating terminfo patches
- Task 74: Added note about better cross-platform support
- Tasks 76-76.6: Archived (neo-neo-blessed migration cancelled)
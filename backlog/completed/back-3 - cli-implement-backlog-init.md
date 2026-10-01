---
task_schema_version: 2
id: BACK-3
title: 'CLI: Implement `backlog init` Command'
status: Done
assignee:
  - '@MrLesk'
reporter: '@MrLesk'
created_date: '2025-06-04'
labels:
  - cli
  - command
milestone: m-1
dependencies:
  - task-2
description: >-
  Implement the `backlog init <project-name>` command in the CLI. This command
  will set up the `.backlog` directory structure and a `config.yml` in the
  current Git repository.
acceptance_criteria:
  - index: 1
    text: >-
      `backlog init <project-name>` command creates all necessary subdirectories
      within `.backlog`.
    checked: true
  - index: 2
    text: >-
      `backlog init <project-name>` creates an initial commit for the `.backlog`
      structure.
    checked: true
  - index: 3
    text: Command provides appropriate user feedback.
    checked: true
definition_of_done: []
comments: []
---
## Implementation Summary

✅ **CLI Implementation Recovered & Complete**

### Features Recovered
- **Command Line Interface**: Built with Commander.js for argument parsing
- **Git Integration**: Automatically detects git repositories and offers to initialize if missing
- **Directory Structure**: Creates complete `.backlog` directory hierarchy
- **Configuration**: Generates `config.yml` with project name and default settings
- **Git Commit**: Automatically commits the initial backlog structure
- **User Feedback**: Provides clear success messages and error handling

### Technical Details
- **Entry Point**: `src/cli.ts` contains the CLI implementation
- **Build System**: Compiles to `cli/index.js` for distribution
- **Package Scripts**: 
  - `bun run cli` - Run CLI from source
  - `bun run build` - Build distributable CLI
- **Testing**: Comprehensive test suite with 5 integration tests
- **Dependencies**: Added `commander@14.0.0` for CLI parsing

### Usage
```bash
# From source
bun src/cli.ts init "My Project"

# Built version  
./cli/index.js init "My Project"

# Help
bun src/cli.ts --help
```

### Test Coverage
- ✅ Initializes backlog project in existing git repo
- ✅ Creates all required directories
- ✅ Handles project names with special characters  
- ✅ Works when git repo exists
- ✅ Creates initial commit with backlog structure

All **62 tests passing** including 5 CLI integration tests.
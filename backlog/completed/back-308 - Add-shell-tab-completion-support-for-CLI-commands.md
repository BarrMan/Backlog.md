---
task_schema_version: 2
id: BACK-308
title: Add shell tab completion support for CLI commands
status: Done
assignee:
  - '@codex'
created_date: '2025-10-23 10:08'
updated_date: '2025-10-27 21:32'
labels:
  - enhancement
  - cli
  - completion
dependencies: []
priority: medium
description: >-
  Implement tab completion functionality for the backlog CLI tool to improve
  developer experience. When users press TAB after typing "backlog", they should
  see available commands. When pressing TAB after subcommands (e.g., "backlog
  task"), they should see subcommands and options.


  This will support bash, zsh, and fish shells with dynamic completions based on
  the actual CLI structure (commands, subcommands, task IDs, status values from
  config).
implementation_plan: >-
  # Implementation Plan for Shell Tab Completion


  ## Research Findings (task-308.01)


  **Evaluated Options:**

  - Commander.js v14: No built-in completion support

  - Third-party libraries (omelette, tabtab): Outdated, poor maintenance

  - **Recommended: Custom implementation** with CLI helper + shell-specific
  scripts


  **Rationale:**

  - Full control over dynamic completions

  - No external dependencies

  - Optimized for our CLI structure

  - Better long-term maintenance


  ## Architecture


  ### Core Components


  1. **Completion Helper Command** (`backlog __complete <line> <point>`)
     - Parses command line to determine context
     - Returns appropriate completions (newline-separated)
     - Handles: commands, subcommands, flags, task IDs, config values

  2. **Data Providers** (`src/completions/data-providers.ts`)
     - `getTaskIds()`: Fetch actual task IDs from Core API
     - `getStatuses()`: Get configured status values
     - `getPriorities()`: Return high/medium/low
     - `getLabels()`: Extract unique labels from tasks
     - `getAssignees()`: Extract unique assignees from tasks

  3. **Shell Scripts** (`completions/`)
     - `backlog.bash`: Bash completion using `complete -F`
     - `_backlog`: Zsh completion using `compdef`
     - `backlog.fish`: Fish completion using `complete -c`

  4. **Installation Command** (`backlog completion install`)
     - Auto-detects shell (bash/zsh/fish)
     - Copies script to correct location
     - Provides enable instructions

  ## File Structure


  ```

  src/

  ├── commands/

  │   └── completion.ts          # Register completion commands

  ├── completions/

  │   ├── helper.ts              # Core completion logic

  │   ├── data-providers.ts      # Dynamic data fetchers

  │   └── command-structure.ts   # Extract Commander.js metadata

  completions/                    # Packaged with npm

  ├── backlog.bash

  ├── _backlog

  └── backlog.fish

  ```


  ## Implementation Phases


  ### Phase 1: Core Infrastructure (Sequential)

  1. Create `src/completions/` directory

  2. Implement `helper.ts` with parsing logic

  3. Implement `data-providers.ts` with Core API integration

  4. Register `__complete` hidden command in `src/cli.ts`

  5. Add unit tests for helper logic


  ### Phase 2: Shell Scripts (PARALLEL - 3 agents)

  1. **Agent 1**: Bash completion script (task-308.02)

  2. **Agent 2**: Zsh completion script (task-308.03)

  3. **Agent 3**: Fish completion script (task-308.04)


  Each script:

  - Calls `backlog __complete` for dynamic completions

  - Includes static completions for performance

  - Follows shell-specific conventions


  ### Phase 3: Dynamic Features (Sequential)

  1. Wire up dynamic completions in all shells (task-308.05)

  2. Implement installation command (task-308.06)

  3. Test on macOS and Linux


  ### Phase 4: Documentation & Testing (Sequential)

  1. Update README with installation guide (task-308.07)

  2. Add usage examples and troubleshooting

  3. Create unit tests for helper

  4. Add integration tests

  5. Manual testing checklist for each shell


  ## Technical Details


  ### Completion Helper Protocol


  ```bash

  backlog __complete "backlog task edit " 19

  # Returns: newline-separated task IDs

  ```


  ### Parsing Context


  ```typescript

  // "backlog task edit " → 

  { command: 'task', subcommand: 'edit', partial: '' }


  // "backlog task create --status " →

  { command: 'task', subcommand: 'create', flag: 'status', partial: '' }

  ```


  ### Installation Paths


  **Bash:**

  - System: `/etc/bash_completion.d/backlog`

  - User: `~/.local/share/bash-completion/completions/backlog`


  **Zsh:**

  - System: `/usr/local/share/zsh/site-functions/_backlog`

  - User: `~/.zsh/completions/_backlog`


  **Fish:**

  - User: `~/.config/fish/completions/backlog.fish`


  ## Error Handling


  - All data providers return empty arrays on error

  - Helper never crashes (shell experience preserved)

  - Installation handles missing directories gracefully

  - Clear error messages with manual installation fallback


  ## Testing Strategy


  1. **Unit tests**: Helper parsing, data providers

  2. **Integration tests**: End-to-end completion scenarios

  3. **Manual testing**: Real shell environments

  4. **CI/CD**: Automated tests in Bun test suite


  ### Phase 5: Post-init Advanced Wizard Integration

  1. Hook into the advanced configuration wizard flow that runs right after
  `backlog init`.

  2. Prompt the user, before other questions, to install shell completions.

  3. If the user accepts, invoke the shared completion installation helper
  (respecting shell detection and options).

  4. Surface clear success/skip messaging so the wizard summary reflects the
  choice.
implementation_notes: "## Implementation Summary\n\nAll shell tab completion functionality has been successfully implemented and tested.\n\n### ✅ Core Infrastructure (Phase 1)\n**Files Created:**\n- `src/completions/helper.ts` - Core completion logic with command parsing\n- `src/completions/data-providers.ts` - Dynamic data fetchers (task IDs, statuses, labels, etc.)\n- `src/completions/command-structure.ts` - Commander.js introspection (extracts commands/flags)\n- `src/commands/completion.ts` - CLI command registration and installation logic\n\n**Key Features:**\n- Extracts all command structure from Commander.js (no hardcoded command lists!)\n- Dynamic completion based on actual backlog data\n- Context-aware suggestions (knows when to show task IDs vs flags vs values)\n- Error handling - completion never breaks the shell\n\n### ✅ Shell Scripts (Phase 2 - Parallel Execution)\n**Files Created:**\n- `completions/backlog.bash` - Bash completion (bash 4.x+ compatible)\n- `completions/_backlog` - Zsh completion (zsh 5.x+ compatible)  \n- `completions/backlog.fish` - Fish completion (fish 3.x+ compatible)\n\n**All scripts:**\n- Call `backlog completion __complete` for unified backend\n- Handle errors gracefully\n- Follow shell-specific conventions\n- Include comprehensive documentation\n\n### ✅ Dynamic Completions (Phase 3)\n**Implemented via data providers:**\n- Task IDs from Core API\n- Status values from actual config\n- Priority values (high, medium, low)\n- Labels extracted from existing tasks\n- Assignees extracted from existing tasks\n- Document IDs from Core API\n\n**Context-aware:**\n- `backlog task edit <TAB>` → shows task IDs\n- `--status <TAB>` → shows configured statuses\n- `--priority <TAB>` → shows priorities\n- `--labels <TAB>` → shows existing labels\n\n### ✅ Installation Command (Phase 4)\n**Features:**\n- Auto-detects shell from `$SHELL` environment variable\n- Manual selection via `--shell bash|zsh|fish`\n- Installs to user directories (no sudo required)\n- Creates directories if they don't exist\n- Provides post-installation instructions\n- Graceful error handling with manual fallback\n\n**Installation paths:**\n- Bash: `~/.local/share/bash-completion/completions/backlog`\n- Zsh: `~/.zsh/completions/_backlog`\n- Fish: `~/.config/fish/completions/backlog.fish`\n\n### ✅ Documentation & Testing (Phase 5)\n**Documentation:**\n- `README.md` - Concise section with quick start and link to detailed docs\n- `completions/README.md` - Comprehensive installation guide for all shells\n- `completions/EXAMPLES.md` - Detailed usage examples and debugging\n\n**Tests:**\n- `src/completions/helper.test.ts` - 14 unit tests, all passing ✅\n- Covers parsing, context detection, argument counting, edge cases\n- Manual testing confirmed for all shells\n\n### \U0001F4CA All Acceptance Criteria Met\n\n**task-308 (parent):**\n- ✅ #1 Pressing TAB after 'backlog' shows all available commands\n- ✅ #2 Pressing TAB after 'backlog task' shows task subcommands\n- ✅ #3 Pressing TAB after 'backlog task edit' shows options\n- ✅ #4 Completion works in bash shell\n- ✅ #5 Completion works in zsh shell\n- ✅ #6 Completion works in fish shell\n- ✅ #7 Dynamic completions suggest actual task IDs\n- ✅ #8 Dynamic completions suggest config values\n- ✅ #9 Installation command available\n- ✅ #10 Documentation added to README\n\n**All subtasks (308.01 through 308.07):**\n- ✅ All marked as Done\n- ✅ All acceptance criteria met\n- ✅ Comprehensive implementation notes added\n\n### \U0001F3AF Technical Highlights\n\n**Maintainability:**\n- No hardcoded command lists - everything extracted from Commander.js\n- Single source of truth for completion logic (TypeScript)\n- Shell scripts are thin wrappers calling the CLI\n- Easy to add new commands/flags - automatic completion support\n\n**Performance:**\n- Fast response time (< 100ms typical)\n- Dynamic data fetched on-demand\n- Graceful error handling\n\n**Architecture:**\n- Clean separation: CLI logic vs shell integration\n- Reusable across all shells\n- Well-tested and documented\n\n### \U0001F680 Usage\n\n```bash\n# Install completions\nbacklog completion install\n\n# Test completions\nbacklog <TAB>\nbacklog task <TAB>\nbacklog task edit <TAB>\nbacklog task create --status <TAB>\n```\n\nOutstanding work: Integrate the completion installer into the advanced wizard prompt so users can opt in immediately after initialization.\n\nVerified shell completion install prompt in wizard CLI flows, tmux, Terminal, and Warp (with PATH override). Tests: bun test, bunx tsc --noEmit, bun run check .."
acceptance_criteria:
  - index: 1
    text: Pressing TAB after 'backlog' shows all available commands
    checked: true
  - index: 2
    text: >-
      Pressing TAB after 'backlog task' shows task subcommands (create, edit,
      list, etc.)
    checked: true
  - index: 3
    text: >-
      Pressing TAB after 'backlog task edit' shows options like --status,
      --priority, etc.
    checked: true
  - index: 4
    text: Completion works in bash shell
    checked: true
  - index: 5
    text: Completion works in zsh shell
    checked: true
  - index: 6
    text: Completion works in fish shell
    checked: true
  - index: 7
    text: Dynamic completions suggest actual task IDs when relevant
    checked: true
  - index: 8
    text: 'Dynamic completions suggest config values (status, priority) when relevant'
    checked: true
  - index: 9
    text: 'Installation command available (e.g., ''backlog completion install'')'
    checked: true
  - index: 10
    text: Documentation added to README
    checked: true
  - index: 11
    text: >-
      Advanced configuration wizard offers to install completions immediately
      after backlog init
    checked: true
definition_of_done: []
comments: []
---

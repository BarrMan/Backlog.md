---
task_schema_version: 2
id: BACK-324
title: Add browser UI initialization flow for uninitialized projects
status: Done
assignee: []
created_date: '2025-11-30 14:51'
updated_date: '2025-11-30 19:20'
labels:
  - enhancement
  - browser
  - ux
dependencies: []
priority: medium
description: >-
  When running `backlog browser` on an uninitialized project, the browser
  currently shows "Loading..." forever with console errors and 400 errors when
  trying to create tasks.


  Instead of failing silently, the browser UI should:

  1. Detect when the project is not initialized

  2. Show a friendly initialization screen instead of the loading state

  3. Allow the user to initialize the project directly from the browser UI


  This improves the onboarding experience for new users who may run `backlog
  browser` before `backlog init`.


  Related to GitHub issue #432 - Browser app not working with uninitialized
  project
implementation_plan: |-
  ## Full Browser Init Wizard Implementation

  ### Backend Changes (src/server/index.ts)

  **Expand POST /api/init endpoint to accept full configuration:**
  ```typescript
  {
    projectName: string;
    integrationMode: 'mcp' | 'cli' | 'none';
    // For MCP mode
    mcpClients?: ('claude' | 'codex' | 'gemini' | 'guide')[];
    // For CLI mode
    agentInstructions?: ('CLAUDE.md' | 'AGENTS.md' | 'GEMINI.md' | '.github/copilot-instructions.md')[];
    installClaudeAgent?: boolean;
    // Advanced config
    advancedConfig?: {
      checkActiveBranches?: boolean;
      remoteOperations?: boolean;
      activeBranchDays?: number;
      bypassGitHooks?: boolean;
      zeroPaddedIds?: number;
      defaultEditor?: string;
      defaultPort?: number;
      autoOpenBrowser?: boolean;
    };
  }
  ```

  **Add endpoint for MCP client configuration:**
  - POST /api/init/mcp-client - Runs MCP client commands (claude mcp add, etc.)

  **Add endpoint for agent instructions:**
  - POST /api/init/agent-files - Creates agent instruction files

  ### Frontend Changes

  **Create multi-step InitializationWizard component:**

  Step 1: Project Name
  - Input field for project name
  - Next button

  Step 2: Integration Mode
  - Radio/card selection: MCP / CLI / Skip
  - Back/Next buttons

  Step 3a (MCP): MCP Client Setup
  - Checkboxes for: Claude Code, Codex, Gemini, Manual Guide
  - Shows progress/results for each client setup
  - Back/Next buttons

  Step 3b (CLI): Agent Instructions
  - Multi-select checkboxes for instruction files
  - Back/Next buttons

  Step 4: Advanced Settings (optional)
  - Toggle to show/hide
  - All advanced config fields from CLI
  - Back/Next buttons

  Step 5 (CLI only): Claude Agent
  - Checkbox to install Claude Code agent
  - Back/Initialize buttons

  Final: Initialize
  - Shows summary
  - Initialize button
  - Progress indicator

  ### Files to Create/Modify

  **Create:**
  - src/web/components/InitializationWizard.tsx (main wizard)
  - src/web/components/init/StepProjectName.tsx
  - src/web/components/init/StepIntegrationMode.tsx
  - src/web/components/init/StepMcpClients.tsx
  - src/web/components/init/StepAgentInstructions.tsx
  - src/web/components/init/StepAdvancedConfig.tsx
  - src/web/components/init/StepClaudeAgent.tsx

  **Modify:**
  - src/server/index.ts - Expand init endpoint
  - src/web/App.tsx - Use InitializationWizard
  - src/web/lib/api.ts - Add full init methods
implementation_notes: |-
  **Implementation complete - Shared core init with browser wizard**

  ### Architecture (Single Entry Point)

  **src/core/init.ts** - Shared initialization logic:
  - `initializeProject(core, options)` - Single function for all init operations
  - Handles: directory structure, config, MCP clients, agent files, Claude agent
  - Returns: `InitializeProjectResult` with config and mcpResults

  **CLI (src/cli.ts)**:
  - Gathers options via interactive prompts
  - Calls `initializeProject()` with collected options
  - Logs results from shared function

  **Browser (src/server/index.ts)**:
  - POST /api/init validates input
  - Calls `initializeProject()` with request body
  - Returns JSON response

  ### Browser Wizard (InitializationScreen.tsx - 815 lines)

  **Step 1: Project Name** - Input field with validation
  **Step 2: Integration Mode** - MCP / CLI / Skip selection
  **Step 3a (MCP)**: Client checkboxes (Claude, Codex, Gemini, Guide)
  **Step 3b (CLI)**: Agent files + Claude agent option
  **Step 4: Advanced Settings** - All config options
  **Step 5: Summary** - Review and initialize

  ### Files

  **Created:**
  - `src/core/init.ts` (202 lines) - Shared init logic

  **Modified:**
  - `src/cli.ts` - Now calls shared init
  - `src/server/index.ts` - Now calls shared init
  - `src/web/components/InitializationScreen.tsx` - Full wizard
  - `src/web/lib/api.ts` - Full options support
  - `src/web/App.tsx` - Init status check

  Build passes, tests pass.
acceptance_criteria:
  - index: 1
    text: Browser command starts server even when project is not initialized
    checked: true
  - index: 2
    text: >-
      Server provides API endpoint to check initialization status (GET
      /api/status)
    checked: true
  - index: 3
    text: >-
      Server provides API endpoint to initialize project (POST /api/init) with
      full configuration
    checked: true
  - index: 4
    text: >-
      Browser UI detects uninitialized state and shows initialization wizard
      instead of loading forever
    checked: true
  - index: 5
    text: 'Initialization wizard Step 1: Project name input'
    checked: true
  - index: 6
    text: >-
      Initialization wizard Step 2: Integration mode selection (MCP connector /
      CLI commands / Skip)
    checked: true
  - index: 7
    text: >-
      Initialization wizard Step 3a (MCP mode): MCP client selection and
      auto-configuration (Claude, Codex, Gemini, or manual guide)
    checked: true
  - index: 8
    text: >-
      Initialization wizard Step 3b (CLI mode): Agent instruction files
      selection (CLAUDE.md, AGENTS.md, GEMINI.md, Copilot)
    checked: true
  - index: 9
    text: 'Initialization wizard Step 4: Advanced settings configuration option'
    checked: true
  - index: 10
    text: >-
      Initialization wizard Step 5 (CLI mode): Claude Code agent installation
      option
    checked: true
  - index: 11
    text: >-
      After successful initialization, browser UI automatically loads the task
      view
    checked: true
  - index: 12
    text: Existing behavior for initialized projects remains unchanged
    checked: true
  - index: 13
    text: All CLI init options are available in browser version
    checked: true
definition_of_done: []
comments: []
---

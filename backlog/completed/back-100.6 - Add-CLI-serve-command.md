---
task_schema_version: 2
id: BACK-100.6
title: Add CLI browser command
status: Done
assignee: []
created_date: '2025-06-22'
updated_date: '2025-07-05'
labels: []
dependencies:
  - task-100.2
parent_task_id: task-100
description: >-
  Integrate web server into CLI with new browser command. This will provide
  users with a simple way to start the web interface from the command line.


  ## Implementation Details


  ### CLI Command Requirements


  **Command Structure:**


  - Add `browser` command to existing CLI in `src/cli.ts`

  - Support port configuration option (default: 3000)

  - Support host binding option (default: localhost)

  - Support browser auto-open option (default: true)


  ### Command Implementation Requirements


  **Core Functionality:**


  - Validate Backlog project exists before starting server

  - Create and configure BacklogServer instance

  - Handle port configuration and fallback

  - Provide clear startup messaging

  - Support graceful shutdown on Ctrl+C/SIGTERM


  **User Experience:**


  - Show clear messaging during server startup

  - Display actual URL when port differs from requested

  - Optionally open browser automatically

  - Handle startup errors gracefully


  ### Browser Integration Requirements


  **Cross-Platform Support:**


  - Detect platform (macOS, Windows, Linux)

  - Use appropriate browser opening command for each platform

  - Handle cases where browser opening fails gracefully

  - Fallback to showing URL in console if automatic opening fails


  ### Error Handling


  - **Port already in use**: Automatically try next available port (3001, 3002,
  etc.)

  - **No available ports**: Show clear error after trying 10 ports

  - **Permission denied**: Suggest using higher port number (>1024)

  - **Network issues**: Clear error messages with troubleshooting tips

  - **Missing dependencies**: Check for required build artifacts


  ### Expected User Experience


  **Successful Startup:**


  - Clear "Starting server..." message

  - Port fallback notification if needed

  - Server URL with emoji for visibility

  - Browser opens automatically (unless disabled)


  **Error Cases:**


  - Project not initialized: Clear message to run `backlog init`

  - No available ports: Error after trying 10 sequential ports

  - Permission issues: Helpful suggestions for resolution


  ### Development Mode


  When `NODE_ENV=development`, the server will:


  - Provide detailed error messages

  - Enable source maps

  - Show helpful debugging information


  ### Production Mode


  In production, the server will:


  - Serve optimized, minified assets

  - Enable caching headers

  - Compress responses

  - Hide detailed error messages
acceptance_criteria:
  - index: 1
    text: '`backlog browser` starts the web server'
    checked: true
  - index: 2
    text: '--port option configures starting port'
    checked: true
  - index: 3
    text: Automatically finds next available port if requested port is busy
    checked: true
  - index: 4
    text: Shows clear message when using different port than requested
    checked: true
  - index: 5
    text: '--open option opens browser automatically with correct URL'
    checked: true
  - index: 6
    text: '--host option configures binding address'
    checked: true
  - index: 7
    text: Server stops gracefully on Ctrl+C
    checked: true
  - index: 8
    text: Clear error message when no ports are available after 10 attempts
    checked: true
definition_of_done: []
comments: []
---

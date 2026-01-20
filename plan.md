Quick Reference: Implementation Phases
PhaseFocusKey Validation1Project Scaffoldingnpm run dev launches Electron window2AuthenticationGoogle SSO flow works, tokens persist3Chat InterfaceMessages display, theme toggle works4Claude Code IntegrationCLI subprocess streams responses5Repository ConfigurationAll 11 repos listed, Claude aware of them6JIRA IntegrationFetch/create tickets, attach files7Plan GenerationValid spawnee.yml with correct conventionsFinalEnd-to-EndFull flow: describe → generate → attach

Overview
Swanson is an Electron-based macOS desktop application that provides a chat-style interface for generating spawnee YAML plans. Users describe features or provide JIRA ticket numbers, and the app orchestrates Claude Code (via CLI subprocess) to analyze repositories and generate comprehensive multi-repo spawnee plans.
Core User Flow

User opens Swanson, authenticates via Google SSO (redirects to existing API gateway → localhost:4200/sso/index.html callback)
User enters a feature description or existing JIRA ticket (e.g., "PD-1234")
App invokes Claude Code CLI as subprocess, passing context about available repositories
Claude Code analyzes relevant repos, asks clarifying questions if needed
Questions surface in chat UI; user responds; responses sent back to Claude Code
Claude Code generates final spawnee.yml following branching conventions
If no JIRA ticket existed, app creates one via Atlassian API
App attaches spawnee.yml to ticket and assigns to chris@teachupbeat.com
User can copy/download the plan for manual spawnee execution

Technical Architecture
┌─────────────────────────────────────────────────────────────┐
│                    Swanson Electron App                      │
│  ┌─────────────────┐  ┌──────────────────────────────────┐  │
│  │   React UI      │  │     Main Process (Node.js)       │  │
│  │   (Renderer)    │  │  ┌────────────────────────────┐  │  │
│  │                 │◄─┼──│  Claude Code CLI Manager   │  │  │
│  │  Chat Interface │  │  │  (child_process.spawn)     │  │  │
│  │  Theme Toggle   │  │  └────────────────────────────┘  │  │
│  │  Settings       │  │  ┌────────────────────────────┐  │  │
│  │                 │  │  │  JIRA Integration          │  │  │
│  └────────┬────────┘  │  │  (REST API via fetch)      │  │  │
│           │           │  └────────────────────────────┘  │  │
│           │ IPC       │  ┌────────────────────────────┐  │  │
│           │           │  │  GitHub Integration        │  │  │
│           ▼           │  │  (for repo metadata)       │  │  │
│  ┌─────────────────┐  │  └────────────────────────────┘  │  │
│  │ Electron IPC    │◄─┼──────────────────────────────────┘  │
│  │ Bridge          │  │                                     │
│  └─────────────────┘  │                                     │
└───────────┬───────────┴─────────────────────────────────────┘
            │
            ▼ SSO callback on localhost:4200
┌─────────────────────────────────────────────────────────────┐
│              Existing API Gateway (AWS)                      │
│              Google SSO → token response                     │
└─────────────────────────────────────────────────────────────┘
Technology Stack

Electron: v28+ (latest stable) for macOS desktop app
Renderer: React 18 + TypeScript
Styling: Tailwind CSS (easy light/dark theming)
State: Zustand (lightweight, simple)
Build: electron-builder for macOS DMG packaging
Claude Code: Invoked via child_process.spawn('claude', [...])

Implementation Plan

Phase 1: Project Scaffolding
Files to create:

package.json - Electron + React dependencies
electron/main.ts - Main process entry
electron/preload.ts - IPC bridge for renderer
src/main.tsx - React entry point
src/App.tsx - Root component with theme provider
tailwind.config.js - Light/dark theme configuration
tsconfig.json - TypeScript configuration
electron-builder.json - macOS build config

✅ Phase 1 Review Checkpoint
Features to verify:

 npm install completes without errors
 npm run dev launches the Electron window
 Window displays a basic "Hello World" or placeholder UI
 No console errors in DevTools (Cmd+Option+I)
 Hot reload works (edit App.tsx, see changes)

Your action required:

Run npm install and confirm all dependencies install
Run npm run dev and confirm the app window opens
Open DevTools and check for any red errors
Confirm: "Phase 1 complete" or report any issues


Phase 2: Authentication
Files to create/modify:

electron/auth.ts - Handle localhost:4200 server for SSO callback
src/hooks/useAuth.ts - Auth state management
src/components/LoginScreen.tsx - Google SSO login button
electron/store.ts - Secure token storage (electron-store with encryption)

Flow:

App starts embedded HTTP server on localhost:4200
User clicks "Sign in with Google"
Opens browser to API gateway SSO URL
Gateway redirects to localhost:4200/sso/index.html with tokens
App captures tokens, stores securely, closes server

✅ Phase 2 Review Checkpoint
Features to verify:

 Login screen displays with "Sign in with Google" button
 Clicking button opens browser to your API gateway SSO URL
 After Google auth, browser redirects to localhost:4200/sso/index.html
 App receives tokens and transitions to main UI (or shows "logged in" state)
 Tokens persist after app restart (close and reopen app)
 Logout button clears tokens and returns to login screen

Your action required:

Click "Sign in with Google" and complete the SSO flow
Verify the app shows your logged-in state (username/email if displayed)
Close the app completely and reopen — confirm you're still logged in
Test logout functionality
Confirm: "Phase 2 complete" or report any issues

Prerequisite info needed from you:

The exact SSO URL for your API gateway (you'll provide during this phase)
Callback returns: accessToken and idToken (idToken used for API Gateway calls)


Phase 3: Chat Interface
Files to create:

src/components/ChatContainer.tsx - Main chat layout
src/components/MessageList.tsx - Scrollable message history
src/components/MessageBubble.tsx - Individual messages (user/assistant)
src/components/ChatInput.tsx - Input field with send button
src/components/ThemeToggle.tsx - Light/dark mode switch
src/stores/chatStore.ts - Message state management

Design (Claude.ai inspired):

Clean white background (light) / dark gray (dark)
Messages centered with max-width container
User messages right-aligned, subtle background
Assistant messages left-aligned
Input fixed at bottom with rounded corners

✅ Phase 3 Review Checkpoint
Features to verify:

 Chat interface displays after login
 Can type in the input field and press Enter or click Send
 User messages appear on the right with distinct styling
 Theme toggle visible (sun/moon icon or similar)
 Clicking theme toggle switches between light and dark mode
 Theme preference persists after app restart
 Long messages wrap properly and don't break layout
 Message list scrolls when content exceeds viewport
 Auto-scroll to newest message when sent

Your action required:

Type a test message and send it — confirm it appears styled correctly
Toggle between light and dark themes — confirm colors change appropriately
Send multiple messages to test scrolling behavior
Restart the app — confirm theme preference was saved
Review the visual design: Does it feel clean and Claude.ai-inspired?
Confirm: "Phase 3 complete" or request design adjustments


Phase 4: Claude Code Integration
Files to create:

electron/claude-code.ts - CLI subprocess manager
electron/ipc-handlers.ts - IPC handlers for renderer communication
src/hooks/useClaudeCode.ts - React hook for Claude Code interaction

Implementation:
typescript// Spawn Claude Code with conversation mode
const claude = spawn('claude', [
  '--print', // Output mode for parsing
  '--output-format', 'stream-json' // Structured output
], {
  cwd: workingDirectory,
  env: { ...process.env }
});

// Stream stdout/stderr to renderer via IPC
claude.stdout.on('data', (data) => {
  mainWindow.webContents.send('claude-output', parseClaudeOutput(data));
});

// Send user input to stdin
ipcMain.on('claude-input', (event, message) => {
  claude.stdin.write(message + '\n');
});
✅ Phase 4 Review Checkpoint
Features to verify:

 Sending a message triggers Claude Code CLI subprocess
 Claude Code output streams into the chat in real-time (not all at once)
 Assistant messages appear left-aligned with distinct styling
 Typing indicator or "thinking" state shown while Claude processes
 Can interrupt/cancel a running Claude session (Escape or Stop button)
 Error handling: if claude CLI not found, show helpful error message
 Multiple back-and-forth exchanges work (conversation maintains context)

Your action required:

Ensure claude CLI is installed and accessible in your PATH
Type a simple prompt like "Hello, what can you help me with?"
Watch for streaming response — confirm text appears progressively
Try a follow-up question — confirm context is maintained
Test error case: temporarily rename claude binary, confirm graceful error
Confirm: "Phase 4 complete" or report any issues

Prerequisite:

Claude Code CLI must be installed (claude --version should work in terminal)


Phase 5: Repository Configuration
Files to create:

config/repositories.json - Predefined repository list
src/components/RepoSelector.tsx - Optional repo filtering UI
electron/repos.ts - Repository metadata loading

Repository Config:
json{
  "repositories": [
    {
      "name": "upbeat-aws-infrastructure",
      "url": "git@github.com:TeachUpbeat/upbeat-aws-infrastructure.git",
      "description": "AWS infrastructure (CloudFormation, Lambda, Cognito)",
      "category": "Infrastructure"
    },
    {
      "name": "upbeat-admin-portal",
      "url": "git@github.com:TeachUpbeat/administrator-portal.git",
      "description": "Angular admin portal with Lambda backend",
      "category": "Web Applications"
    }
    // ... all 12 repositories from catalog
  ]
}
✅ Phase 5 Review Checkpoint
Features to verify:

 All 12 repositories from catalog are listed in config/repositories.json
 Repository info is injected into Claude Code context when starting a session
 (Optional) Repo selector UI allows filtering which repos to consider
 Claude Code receives repo list and can reference them in responses

Your action required:

Review config/repositories.json — confirm all repos are present and URLs correct
Start a new chat and ask: "What repositories do you have access to?"
Claude should list the configured repositories
Confirm: "Phase 5 complete" or report missing/incorrect repos

Full repository list to verify:

upbeat-aws-infrastructure
upbeat-admin-portal (administrator-portal)
upbeat-district-administration (district-administrator)
upbeat-reports (reports-2.0)
upbeat-survey-administration
upbeat-survey-editor (survey-administrator)
upbeat-user-administration (user-administrator)
upbeat-engagement-database (engagement-database)
upbeat-survey-legacy (survey)
upbeat-pdf-generator (pdf-generator)
upbeat-presentation-generator (google-presentations)


Phase 6: JIRA Integration
Files to create:

electron/jira.ts - JIRA REST API client
src/components/TicketDisplay.tsx - Show ticket info in chat
src/components/JiraSetup.tsx - First-time JIRA API token configuration

API Operations:

GET /rest/api/3/issue/{issueKey} - Fetch existing ticket
POST /rest/api/3/issue - Create new ticket
POST /rest/api/3/issue/{issueKey}/attachments - Attach spawnee.yml
PUT /rest/api/3/issue/{issueKey} - Assign to Chris

Auth: Use Atlassian API token (stored securely) with basic auth header
✅ Phase 6 Review Checkpoint
Features to verify:

 First-time setup prompts for JIRA API token (with link to create one)
 API token stored securely (encrypted in electron-store)
 Can fetch existing ticket: type "PD-1234" and see ticket details display
 Can create new ticket: app creates ticket with title/description
 Can attach file to ticket: spawnee.yml uploads successfully
 Ticket assigned to chris@teachupbeat.com automatically
 Error handling for invalid ticket numbers, auth failures, network issues

Your action required:

Generate a JIRA API token at: https://id.atlassian.com/manage-profile/security/api-tokens
Enter the token in the app's setup screen
Test fetching: type an existing ticket number (e.g., "PD-100") — confirm details show
Test creation: let the app create a test ticket — verify it appears in JIRA
Test attachment: confirm a file can be attached to the test ticket
Verify the ticket is assigned to chris@teachupbeat.com
Confirm: "Phase 6 complete" or report any issues

Prerequisite info needed:

Your JIRA email address for API auth (e.g., chris@teachupbeat.com)
JIRA API token (you'll generate this)


Phase 7: Plan Generation & Output
Files to create:

src/components/PlanPreview.tsx - YAML preview with syntax highlighting
src/components/PlanActions.tsx - Copy/Download/Attach buttons
electron/plan-manager.ts - Save and manage generated plans
config/spawnee-template.ts - System prompt for spawnee plan generation

Output includes:

Formatted spawnee.yml following CLAUDE.md conventions
Integration branch: spawnee/PD-{ticket}-{description}
All tasks with proper branch setup, task, and PR sections

✅ Phase 7 Review Checkpoint
Features to verify:

 After Claude generates a plan, YAML preview displays with syntax highlighting
 YAML follows spawnee conventions (integration branch pattern, task structure)
 "Copy to Clipboard" button works
 "Download" button saves spawnee.yml to local filesystem
 "Attach to JIRA" button uploads to the associated ticket
 Plan includes all required sections: branch setup, task description, PR target
 Branch naming follows pattern: spawnee/PD-{ticket}-{description}

Your action required:

Describe a sample feature: "Add a logout button to the admin portal"
Answer any clarifying questions from Claude
Review the generated YAML plan — check for:

Correct integration branch naming
Proper task dependencies
Branch setup instructions in each task
PR targets pointing to integration branch (not main/develop)


Test Copy, Download, and Attach buttons
Open the JIRA ticket and verify attachment is visible
Confirm: "Phase 7 complete" or request changes to plan format

YAML validation checklist:
yaml# Verify these elements are present:
name: "PD-XXXX Feature Name"
repository:
  branch: "spawnee/PD-XXXX-feature-name"      # ✓ Integration branch
  baseBranch: "spawnee/PD-XXXX-feature-name"  # ✓ Same as branch
tasks:
  - id: descriptive-task-id
    prompt: |
      ## Branch Setup
      git checkout spawnee/PD-XXXX-...        # ✓ Checkout integration
      git checkout -b spawnee/PD-XXXX-task    # ✓ Create task branch
      ## Task
      ...
      ## PR
      Create PR targeting spawnee/PD-XXXX-... # ✓ NOT main/develop

File Structure
swanson/
├── electron/
│   ├── main.ts              # Main process entry
│   ├── preload.ts           # IPC bridge
│   ├── auth.ts              # SSO handling
│   ├── claude-code.ts       # CLI subprocess manager
│   ├── jira.ts              # JIRA API client
│   ├── repos.ts             # Repository config loader
│   ├── plan-manager.ts      # Plan file management
│   ├── store.ts             # Secure storage
│   └── ipc-handlers.ts      # All IPC handlers
├── src/
│   ├── main.tsx             # React entry
│   ├── App.tsx              # Root with providers
│   ├── components/
│   │   ├── LoginScreen.tsx
│   │   ├── ChatContainer.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── ChatInput.tsx
│   │   ├── ThemeToggle.tsx
│   │   ├── RepoSelector.tsx
│   │   ├── TicketDisplay.tsx
│   │   ├── PlanPreview.tsx
│   │   └── PlanActions.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   └── useClaudeCode.ts
│   ├── stores/
│   │   └── chatStore.ts
│   └── styles/
│       └── globals.css
├── config/
│   └── repositories.json
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── electron-builder.json
└── README.md
Configuration Constants
typescript// config/constants.ts
export const JIRA_CONFIG = {
  baseUrl: 'https://teachupbeat.atlassian.net',
  projectKey: 'PD',
  assigneeEmail: 'chris@teachupbeat.com'
};

export const SSO_CONFIG = {
  callbackPort: 4200,
  callbackPath: '/sso/index.html'
};

export const BRANCH_PREFIX = 'spawnee';

🎯 Final End-to-End Validation
Once all phases are complete, perform this comprehensive test:
Scenario A: New Feature (No Existing Ticket)
Steps:

Launch Swanson and sign in via Google SSO
Type: "I want to add a bulk user import feature to the user administration portal"
Claude should ask clarifying questions — answer them naturally
Claude generates a spawnee.yml plan
Verify: New PD ticket created in JIRA
Verify: spawnee.yml attached to the ticket
Verify: Ticket assigned to chris@teachupbeat.com
Download the YAML and review against spawnee conventions

Expected outcome:

 Ticket created with descriptive title
 Plan attached as spawnee.yml
 Plan uses integration branch: spawnee/PD-XXXX-bulk-user-import
 Tasks target correct repos (user-administrator, possibly engagement-database)
 All PR targets point to integration branch

Scenario B: Existing Ticket
Steps:

Start fresh chat in Swanson
Type: "PD-1234" (use a real ticket number)
Claude should fetch and display ticket details
Claude asks about implementation approach
Answer questions and let Claude generate plan
Verify: Plan attached to existing PD-1234 ticket (not a new one)

Expected outcome:

 Existing ticket details displayed
 No duplicate ticket created
 Plan attached to the specified ticket
 Branch naming includes ticket number: spawnee/PD-1234-...

Scenario C: Multi-Repository Feature
Steps:

Type: "Add a new survey response export that generates PDFs"
This should involve: survey, pdf-generator, possibly reports-2.0
Review generated plan

Expected outcome:

 Plan includes tasks for multiple repositories
 Each repo has correct URL in task-level override
 Dependencies make sense (e.g., API before frontend)
 All tasks share the same integration branch base


Security Considerations (SOC2)

Tokens: Stored locally using electron-store with encryption at rest
JIRA API token: User provides their own token, stored encrypted locally
No sensitive data transmitted: Claude Code runs locally, repos cloned locally
Audit trail: All generated plans attached to JIRA tickets for traceability


Cleanup / Polish
Items flagged for future improvement:
Streaming Response Display
Issue: Claude Code responses appear as one complete block instead of streaming token-by-token in real-time.
Current state:

Added --include-partial-messages flag to Claude CLI args
Using assistant message type with content_block_delta for streaming
Text arrives and displays, but not progressively

Potential investigation areas:

Check if content_block_delta events are being emitted by the CLI
Verify IPC message batching isn't causing perceived delay
Consider adding artificial chunking of large text blocks for visual streaming effect
Review Claude CLI documentation for additional streaming options

Priority: Low (functional but not ideal UX)
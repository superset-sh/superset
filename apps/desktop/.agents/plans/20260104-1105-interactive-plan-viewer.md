# Interactive Plan Viewer for Superset Desktop

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

## Purpose / Big Picture

When an AI coding agent (OpenCode or Claude Code) submits a plan via the `submit_plan` tool or `ExitPlanMode` hook, Superset Desktop will automatically open the plan in a new pane with beautiful Tufte-styled markdown rendering. This enables users to review agent plans visually within the app rather than in the terminal, creating a foundation for future annotation, approval, and feedback features (like Plannotator).

**User-visible outcome**: When an agent finishes planning and calls `submit_plan`, a new pane automatically opens in the current tab showing the plan with the existing Tufte markdown styling. The user sees the same beautiful rendering they'd see when viewing any `.md` file.

**This is Phase 1 of a multi-phase feature** inspired by Plannotator. The dedicated `plan-viewer` pane type provides extension points for future phases: approve/reject workflow, text annotations, and structured feedback.

## Assumptions

- The existing `MarkdownRenderer` component is suitable for rendering plan content (confirmed - it has Tufte styling)
- Plans are markdown strings that can be displayed without modification

## Critical Discovery (2026-01-04)

### Initial OpenCode Research (Partially Incorrect)
Initial research of the OpenCode codebase suggested no plugin system exists. However, analysis of Plannotator's implementation reveals a different picture.

### Plannotator Analysis (Key Insights)

Plannotator (https://github.com/backnotprop/plannotator) has working integrations for both Claude Code and OpenCode:

**Claude Code Integration:**
- Uses `ExitPlanMode` permission hook
- Plan content IS exposed at `event.tool_input.plan`
- Hook reads plan from stdin as JSON event

**OpenCode Integration:**
- Registers as `@plannotator/opencode@latest` plugin
- Exposes a `submit_plan` tool
- NOT using MCP servers - uses OpenCode's native plugin system

**Architecture Pattern (Plannotator):**
```
Hook spawned → Read plan from stdin → Start ephemeral HTTP server → Open browser → Wait for decision → Return JSON to agent
```

### Superset's Simplified Approach

Since we're **already inside Electron**, we don't need the ephemeral server pattern:

```
Agent Hook → Write temp file → Notify main process → tRPC subscription → Display in pane
```

**Both agents can be supported in Phase 1:**
1. **Claude Code**: Hook `ExitPlanMode` permission request, read `tool_input.plan`
2. **OpenCode**: Register plugin with `submit_plan` tool (same pattern as Plannotator)

## Open Questions

All questions resolved - see Decision Log.

## Phased Roadmap (Plannotator-Inspired Features)

This plan implements **Phase 1**. The architecture is designed to enable future phases:

### Phase 1: View Plans (This Plan)
- Dedicated `plan-viewer` pane type with `PlanViewerState`
- Stores metadata: `content`, `originPaneId`, `planId`, `status`, `submittedAt`
- Tufte-styled markdown rendering via existing `MarkdownRenderer`
- Pane appears without stealing focus, marked with `needsAttention`

### Phase 2: Approve / Request Changes (Future)
- Add `DecisionBar` component to `PlanViewerPane` with Approve/Reject buttons
- Add `status: 'pending' | 'approved' | 'rejected'` to `PlanViewerState`
- Send decision back to agent via `originPaneId` → notification system
- Global feedback textarea for rejection comments

**See detailed implementation plan below.**

### Phase 3: Text Annotations (Future)
- Add `annotations: Annotation[]` to `PlanViewerState`
- Wrap `MarkdownRenderer` with `AnnotatableViewer` using `web-highlighter` library
- Add `Toolbar` component for annotation actions (delete/comment/replace)
- Export annotations as structured markdown feedback (like Plannotator)

**See detailed implementation plan below.**

### Phase 4: Advanced Features (Future)
- Plan history in workspace sidebar
- Obsidian export with frontmatter
- Diff view between plan revisions
- Shareable URL links via compression

### How Phase 1 Enables Future Phases

    PlanViewerState (Phase 1)           Future Extensions
    ─────────────────────────           ─────────────────
    content: string          ───────►   Same, used by all phases
    planId: string           ───────►   Track plan lifecycle, enable history
    originPaneId: string     ───────►   Send approval/feedback back to agent
    status: 'pending'        ───────►   Add 'approved' | 'rejected' in Phase 2
    submittedAt: number      ───────►   Display, sorting, cleanup
    (future) annotations[]   ───────►   Add in Phase 3 for text feedback

## Progress

- [ ] (pending) Milestone 1: Add `plan-viewer` pane type to shared types
- [ ] (pending) Milestone 2: Create PlanViewerPane component
- [ ] (pending) Milestone 3: Extend Claude Code wrapper to hook `ExitPlanMode`
- [ ] (pending) Milestone 4: Create OpenCode plugin with `submit_plan` tool
- [ ] (pending) Milestone 5: Add main process plan handler (validate, read, emit)
- [ ] (pending) Milestone 6: Handle plan event in renderer, add store action
- [ ] (pending) Validation: End-to-end test with both Claude Code and OpenCode

## Surprises & Discoveries

- **2026-01-04 (Initial): OpenCode codebase research.** Initial research of OpenCode GitHub suggested no plugin hook system and only MCP server extensibility.

- **2026-01-04 (Revised): Plannotator analysis changes everything.** Analysis of https://github.com/backnotprop/plannotator revealed:
  - **Claude Code**: `ExitPlanMode` hook DOES expose plan content at `event.tool_input.plan`
  - **OpenCode**: Has a plugin system (separate from MCP) - Plannotator uses `@plannotator/opencode@latest`
  - Both agents can be supported in Phase 1
  - Architecture simplified: no ephemeral HTTP server needed since we're already in Electron
  - Plan revised to use native hook/plugin patterns matching Plannotator's approach

## Decision Log

- **Decision #1: Plan pane appears without stealing focus**
  Rationale: User may be actively working in the terminal when the plan is submitted. Stealing focus would be disruptive. The pane appears in the layout and the user can click on it when ready to review. Use `needsAttention: true` instead of focus.
  Date: 2026-01-04 / User decision

- **Decision #2: Plans are ephemeral (not persisted across restarts)**
  Rationale: Plans are transient artifacts - you review, approve/modify, then implement. The plan content already exists in terminal scrollback. Persisting adds complexity (serialize large markdown, handle stale plans). Future features can add "Save to Obsidian" or "Export as file" if users want to keep plans.
  
  Implementation (per Oracle review):
  - Use Zustand `persist` middleware's `partialize` option
  - Filter BOTH panes (exclude `type === 'plan-viewer'`) AND layout references
  - Must remove plan-viewer pane IDs from tab layouts to avoid dangling pointers on rehydration
  - Follow existing `partialize` patterns in the codebase
  
  Date: 2026-01-04 / User + Agent + Oracle consensus

- **Decision #3: Minimal header, content-first display**
  Rationale: Plans typically have their own `# Title` heading - no need to duplicate. The MosaicWindow toolbar already shows pane name. A heavy metadata header adds visual noise. Implementation: Tab bar shows plan title (extracted from first heading or summary), toolbar shows small timestamp badge + close/lock buttons (same pattern as FileViewerPane), content area is full Tufte-rendered markdown with no extra header.
  Date: 2026-01-04 / User + Agent consensus

- **Decision #4: Temp file for content transport**
  Rationale: Avoids pushing large markdown through querystrings, JSON bodies, or tRPC payloads. File paths are tiny and robust. Plugin writes plan to temp directory, notification carries only the file path, main process reads file and emits content via tRPC subscription.
  
  Implementation details (per Oracle review):
  - Use `os.homedir()` explicitly, NOT `~` (shell expansion doesn't work in Node APIs)
  - Main process owns the temp directory path, passes to plugin via env var (e.g., `SUPERSET_PLANS_DIR`)
  - Use `fs.mkdir(dir, { recursive: true })` before writing
  - Security: Use `path.resolve()` + `realpath()` to canonicalize paths, prevent `../` traversal and symlink escapes
  - Only accept files matching pattern: `{PLANS_DIR}/{planId}.md` where planId is alphanumeric + hyphens
  - Max file size guard: reject files > 1MB to prevent renderer freeze
  - Cleanup: Best-effort, non-blocking deletion of old plan files on app start (mtime > 24h)
  
  Date: 2026-01-04 / Oracle recommendation

- **Decision #5: Dedicated plan-viewer pane (not reusing file-viewer)**
  Rationale: While file-viewer could render markdown, a dedicated pane type provides clean extension points for future Plannotator-like features (approve/reject, annotations, feedback). Retrofitting these onto file-viewer would be awkward. The extra upfront work (~2 hours) pays off in Phase 2+.
  Date: 2026-01-04 / User + Agent consensus

- **Decision #6: Use native hook/plugin patterns (matching Plannotator)** ⚠️ REVISED TWICE

  **Original:** Use `tool.execute.after` hook in OpenCode plugin

  **First Revision:** Use MCP server (based on OpenCode codebase research)

  **Final Revision (after Plannotator analysis):** Use native patterns for each agent:

  - **Claude Code**: Hook `ExitPlanMode` permission request, read plan from `event.tool_input.plan`
  - **OpenCode**: Register plugin with `submit_plan` tool (same pattern as Plannotator)

  Key insight from Plannotator: Both agents have working integration patterns that don't require MCP servers. Plannotator's `@plannotator/opencode@latest` plugin proves OpenCode has a plugin system beyond MCP.

  Benefits:
  - Proven patterns (Plannotator has working implementations)
  - Simpler than MCP server approach
  - Both agents supported in Phase 1
  - No new dependencies (`@modelcontextprotocol/sdk` not needed)

  Date: 2026-01-04 / Final revision after Plannotator analysis

- **Decision #7: Oracle review items addressed**
  The following implementation details were added per Oracle's second review:
  - Path handling: Use `os.homedir()` explicitly, never `~`; use `path.resolve()` + `realpath()` for canonicalization
  - Security: Validate paths are within allowed directory, check filename pattern, prevent traversal
  - Size guard: Reject plan files > 1MB to prevent renderer freeze
  - Persistence: Filter both panes AND layout references to avoid dangling pointers
  - Env var: Main process passes `SUPERSET_PLANS_DIR` to plugin via wrapper script
  - Cleanup: Best-effort, non-blocking deletion of old files
  Date: 2026-01-04 / Oracle review incorporated

## Outcomes & Retrospective

(To be filled at completion)

## Context and Orientation

### Existing Architecture

The Superset desktop app uses Electron with a React renderer. Key architectural pieces:

**Agent Wrappers** (`apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts`):
- Wrapper scripts for Claude Code and OpenCode that inject hooks/plugins
- OpenCode plugin already hooks into `session.idle`, `session.error`, and `permission.ask` events
- Uses `SUPERSET_TAB_ID` environment variable to identify which terminal pane triggered the notification

**Notification System**:
- Main process receives notifications from agent hooks via a notify script
- Notifications are broadcast to renderer via tRPC subscriptions
- `apps/desktop/src/renderer/stores/tabs/useAgentHookListener.ts` handles `AGENT_COMPLETE` and `FOCUS_TAB` events

**Tabs/Panes Store** (`apps/desktop/src/renderer/stores/tabs/store.ts`):
- Manages tab and pane state with Zustand
- `addFileViewerPane()` opens files in panes with view mode detection
- `createFileViewerPane()` creates pane objects for file viewing
- Pane types are `terminal`, `webview`, or `file-viewer`

**MarkdownRenderer** (`apps/desktop/src/renderer/components/MarkdownRenderer/`):
- Beautiful Tufte-styled markdown rendering
- Uses `react-markdown` with `remark-gfm` and `rehype-raw`/`rehype-sanitize`
- Has `SelectionContextMenu` for text selection (useful for future annotation)
- Configurable styles via `tufteConfig` and `defaultConfig`

**FileViewerPane** (`apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/FileViewerPane/FileViewerPane.tsx`):
- Renders file content in three modes: `rendered` (markdown), `raw` (editor), `diff`
- Fetches content from disk via tRPC query `changes.readWorkingFile`
- Uses `MarkdownRenderer` for rendered mode

### File Paths

Key files to modify or reference:

    apps/desktop/src/shared/tabs-types.ts          # Add plan-viewer pane type
    apps/desktop/src/renderer/stores/tabs/types.ts # Renderer-specific types
    apps/desktop/src/renderer/stores/tabs/utils.ts # Add createPlanViewerPane helper
    apps/desktop/src/renderer/stores/tabs/store.ts # Add addPlanViewerPane action
    apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts # Extend OpenCode plugin
    apps/desktop/src/shared/constants.ts           # Add PLAN_SUBMITTED event type
    apps/desktop/src/renderer/stores/tabs/useAgentHookListener.ts # Handle plan events

New files to create:

    apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/PlanViewerPane/
    ├── PlanViewerPane.tsx
    └── index.ts

## Plan of Work

### Architecture Overview

**Claude Code Flow:**
```
Claude Code                     Superset Hook                    Main Process                     Renderer
      │                              │                              │                              │
      │ 1. ExitPlanMode              │                              │                              │
      │    permission request        │                              │                              │
      ├─────────────────────────────>│                              │                              │
      │                              │ 2. Read tool_input.plan      │                              │
      │                              │ 3. Write to temp file        │                              │
      │                              │ 4. notify.sh { filePath }    │                              │
      │                              ├─────────────────────────────>│                              │
      │                              │                              │ 5. Validate & read file      │
      │                              │                              │ 6. Emit PLAN_SUBMITTED       │
      │                              │                              ├─────────────────────────────>│
      │                              │                              │    7. addPlanViewerPane()    │
      │<─────────────────────────────┤                              │       with needsAttention    │
      │ 8. Return { behavior: allow }│                              │                              │
```

**OpenCode Flow:**
```
OpenCode Agent                  Superset Plugin                  Main Process                     Renderer
      │                              │                              │                              │
      │ 1. Calls submit_plan tool    │                              │                              │
      ├─────────────────────────────>│                              │                              │
      │                              │ 2. Write to temp file        │                              │
      │                              │ 3. notify.sh { filePath }    │                              │
      │                              ├─────────────────────────────>│                              │
      │                              │                              │ 4. Validate & read file      │
      │                              │                              │ 5. Emit PLAN_SUBMITTED       │
      │                              │                              ├─────────────────────────────>│
      │                              │                              │    6. addPlanViewerPane()    │
      │<─────────────────────────────┤                              │       with needsAttention    │
      │ 7. Return success message    │                              │                              │
```

### Milestone 1: Add `plan-viewer` Pane Type

Extend the shared types to support a new pane type for plans.

**In `apps/desktop/src/shared/tabs-types.ts`**:
1. Add `"plan-viewer"` to the `PaneType` union
2. Add `PlanViewerState` interface:
    
        interface PlanViewerState {
          content: string;           // The plan markdown
          planId: string;            // Unique identifier for this plan
          originPaneId: string;      // Terminal pane that submitted (for future response)
          status: 'pending';         // Future: 'approved' | 'rejected'
          summary?: string;          // Optional brief summary
          submittedAt: number;       // Timestamp
          agentType?: 'opencode' | 'claude';
        }
    
3. Add optional `planViewer?: PlanViewerState` field to `Pane` interface

**In `apps/desktop/src/renderer/stores/tabs/utils.ts`**:
1. Add `CreatePlanViewerPaneOptions` interface
2. Add `createPlanViewerPane(tabId, options)` factory function

**In `apps/desktop/src/renderer/stores/tabs/store.ts`** (persist config):
1. Update `partialize` in the persist middleware to exclude plan-viewer pane content from persistence (per Decision #2)

### Milestone 2: Create PlanViewerPane Component

Create a new pane component for rendering plans.

**Create `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/PlanViewerPane/PlanViewerPane.tsx`**:

1. Similar structure to `FileViewerPane` but simpler (no file fetching, no diff mode)
2. Accept `pane.planViewer.content` directly (already loaded by main process)
3. Render using `MarkdownRenderer` with Tufte styling
4. Minimal toolbar: plan title (from first heading), small timestamp badge, close/lock buttons (per Decision #3)
5. No content header - let the markdown content speak for itself
6. Props include `originPaneId` for future Phase 2 response channel

**Modify `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabsContent.tsx`**:

1. Add case for `plan-viewer` pane type in `renderTile()`
2. Render `PlanViewerPane` component with appropriate props

### Milestone 3: Extend Claude Code Wrapper for `ExitPlanMode` Hook

Add plan interception to the Claude Code wrapper.

**In `apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts`**:

The existing Claude Code wrapper already has hook infrastructure. Add handling for `ExitPlanMode`:

```typescript
// In the Claude Code plugin/hook handler
// When ExitPlanMode permission is requested, the event contains the plan

async function handleClaudeCodeHook(event: HookEvent) {
  // Check if this is an ExitPlanMode permission request
  if (event.type === 'PermissionRequest' && event.permission?.name === 'ExitPlanMode') {
    const plan = event.tool_input?.plan;

    if (plan) {
      // Generate safe plan ID
      const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      // Write plan to temp file
      const plansDir = process.env.SUPERSET_PLANS_DIR;
      await fs.mkdir(plansDir, { recursive: true });
      const planPath = path.join(plansDir, `${planId}.md`);
      await fs.writeFile(planPath, plan, 'utf-8');

      // Notify main process
      const payload = JSON.stringify({
        type: 'plan_submitted',
        planId,
        planPath,
        originPaneId: process.env.SUPERSET_TAB_ID,
        agentType: 'claude',
      });
      execSync(`bash "${process.env.SUPERSET_NOTIFY_SCRIPT}" '${payload}'`);
    }

    // Allow the permission (plan mode exit proceeds)
    return { behavior: 'allow' };
  }

  // Handle other events...
}
```

**Hook Event Structure (from Plannotator analysis):**
```typescript
interface ExitPlanModeEvent {
  type: 'PermissionRequest';
  permission: {
    name: 'ExitPlanMode';
  };
  tool_input: {
    plan: string;  // The full markdown plan content
  };
}
```

### Milestone 4: Create OpenCode Plugin with `submit_plan` Tool

Create an OpenCode plugin (similar to Plannotator's approach).

**Create `apps/desktop/src/main/lib/agent-plugins/opencode-plan/`**:

The plugin follows Plannotator's pattern - it's a simple script that:
1. Registers a `submit_plan` tool
2. Writes plan to temp file when called
3. Notifies Superset main process

**`index.ts`** (OpenCode plugin entry point):

```typescript
// OpenCode plugin for plan submission
// Registered via opencode.json as "@superset/opencode-plan"

import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

const PLANS_DIR = process.env.SUPERSET_PLANS_DIR || path.join(process.env.HOME || '', '.superset', 'tmp', 'plans');
const NOTIFY_SCRIPT = process.env.SUPERSET_NOTIFY_SCRIPT;
const ORIGIN_PANE_ID = process.env.SUPERSET_TAB_ID || '';

// Plugin definition matching OpenCode's plugin API
export default {
  name: '@superset/opencode-plan',
  version: '1.0.0',

  tools: {
    submit_plan: {
      description: 'Submit an implementation plan for visual review in Superset. Use this when you have created a plan that the user should review before implementation.',
      parameters: {
        type: 'object',
        properties: {
          plan: {
            type: 'string',
            description: 'The full markdown content of the plan',
          },
          summary: {
            type: 'string',
            description: 'A brief one-line summary of the plan',
          },
        },
        required: ['plan'],
      },

      async execute({ plan, summary }: { plan: string; summary?: string }) {
        // Generate safe plan ID
        const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        // Ensure directory exists
        await fs.mkdir(PLANS_DIR, { recursive: true });

        // Write plan to temp file
        const planPath = path.join(PLANS_DIR, `${planId}.md`);
        await fs.writeFile(planPath, plan, 'utf-8');

        // Notify Superset main process
        if (NOTIFY_SCRIPT) {
          const payload = JSON.stringify({
            type: 'plan_submitted',
            planId,
            planPath,
            summary,
            originPaneId: ORIGIN_PANE_ID,
            agentType: 'opencode',
          });
          try {
            execSync(`bash "${NOTIFY_SCRIPT}" '${payload}'`);
          } catch (err) {
            console.error('[superset-plan] Failed to notify:', err);
          }
        }

        return 'Plan submitted successfully. It is now displayed in Superset for review.';
      },
    },
  },
};
```

**Configure OpenCode** to use the plugin via `.opencode.json` or wrapper script:

```json
{
  "plugins": ["@superset/opencode-plan"]
}
```

**Update wrapper script** in `apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts`:

```typescript
export function buildOpenCodeWrapperScript(
  opencodeConfigDir: string,
  plansTmpDir: string,
  notifyScript: string,
): string {
  return `#!/bin/bash
${WRAPPER_MARKER}
# Superset wrapper for OpenCode

${REAL_BINARY_RESOLVER}
REAL_BIN="$(find_real_binary "opencode")"
if [ -z "$REAL_BIN" ]; then
  echo "${getMissingBinaryMessage("opencode")}" >&2
  exit 127
fi

export OPENCODE_CONFIG_DIR="${opencodeConfigDir}"
export SUPERSET_PLANS_DIR="${plansTmpDir}"
export SUPERSET_NOTIFY_SCRIPT="${notifyScript}"
exec "$REAL_BIN" "$@"
`;
}
```

**In `apps/desktop/src/shared/constants.ts`**:

Add new notification event type:

    NOTIFICATION_EVENTS = {
      ...existing,
      PLAN_SUBMITTED: 'plan_submitted',
    }

### Milestone 5: Main Process Plan Handler

Add plan notification handling in main process.

**In `apps/desktop/src/main/lib/notifications/server.ts`** (or equivalent):

1. Add handler for `plan_submitted` notification type
2. Validate `planPath` is within allowed directory (security)
3. Read file content from disk
4. Emit via tRPC subscription with full content + metadata

**Create `apps/desktop/src/main/lib/plans/` directory**:

1. `paths.ts` - Define `PLANS_TMP_DIR`
2. `cleanup.ts` - Delete old plan files on app start (mtime > 24h)
3. `validate.ts` - Validate plan file paths are safe

### Milestone 6: Handle Plan Event in Renderer

Add plan handling to the notification subscription.

**In `apps/desktop/src/renderer/stores/tabs/store.ts`**:

Add `addPlanViewerPane(workspaceId, options)` action:
1. Similar to `addFileViewerPane` but creates a plan-viewer pane
2. Reuses unlocked plan-viewer panes or creates new one
3. Sets `needsAttention: true` instead of focus (per Decision #1)
4. Does NOT update `focusedPaneIds` - pane appears without disrupting user

**In `apps/desktop/src/renderer/stores/tabs/useAgentHookListener.ts`**:

Add handler for `PLAN_SUBMITTED` event:
1. Extract plan content and metadata from event
2. Resolve target workspace from `SUPERSET_TAB_ID`
3. Call `addPlanViewerPane()` to display the plan
4. Pane appears with attention indicator, user clicks when ready

### Milestone 7: Claude Code Hook Extension (Out of Scope)

Explicitly out of scope for Phase 1. Claude Code's `ExitPlanMode` hook may not expose plan content. Revisit when we have a reliable mechanism to capture the plan text from Claude Code.

## Concrete Steps

### Step 1: Create Plans Directory Structure

    mkdir -p apps/desktop/src/main/lib/plans

Create helper files:

**`paths.ts`**:

    import os from "node:os";
    import path from "node:path";
    import { app } from "electron";
    
    // Use app.getPath for Electron-managed user data, or fallback for dev
    const getBaseDir = () => {
      try {
        return app.getPath("userData");
      } catch {
        return path.join(os.homedir(), ".superset");
      }
    };
    
    export const PLANS_TMP_DIR = path.join(getBaseDir(), "tmp", "plans");
    
    // Valid plan ID pattern: alphanumeric + hyphens only
    export const PLAN_ID_PATTERN = /^[a-zA-Z0-9-]+$/;
    
    export const MAX_PLAN_FILE_SIZE = 1024 * 1024; // 1MB

**`validate.ts`**:

    import fs from "node:fs";
    import path from "node:path";
    import { PLANS_TMP_DIR, PLAN_ID_PATTERN, MAX_PLAN_FILE_SIZE } from "./paths";
    
    export async function validateAndReadPlanFile(filePath: string): Promise<{
      ok: true; content: string;
    } | {
      ok: false; error: string;
    }> {
      // Resolve to canonical path (prevents ../ traversal)
      const resolvedPath = path.resolve(filePath);
      const realPath = await fs.promises.realpath(resolvedPath).catch(() => null);
      
      if (!realPath) {
        return { ok: false, error: "File does not exist" };
      }

      // Must be within PLANS_TMP_DIR (use path.sep to prevent /plans-evil/ bypass)
      const normalizedDir = PLANS_TMP_DIR.endsWith(path.sep) ? PLANS_TMP_DIR : PLANS_TMP_DIR + path.sep;
      if (!realPath.startsWith(normalizedDir)) {
        return { ok: false, error: "Path outside allowed directory" };
      }
      
      // Filename must match pattern
      const filename = path.basename(realPath);
      const planId = filename.replace(/\.md$/, "");
      if (!PLAN_ID_PATTERN.test(planId)) {
        return { ok: false, error: "Invalid plan ID format" };
      }
      
      // Check file size
      const stats = await fs.promises.stat(realPath);
      if (stats.size > MAX_PLAN_FILE_SIZE) {
        return { ok: false, error: "Plan file too large" };
      }
      
      const content = await fs.promises.readFile(realPath, "utf-8");
      return { ok: true, content };
    }

**`cleanup.ts`**:

    import fs from "node:fs";
    import path from "node:path";
    import { PLANS_TMP_DIR } from "./paths";
    
    const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
    
    export async function cleanupOldPlanFiles(): Promise<void> {
      try {
        const files = await fs.promises.readdir(PLANS_TMP_DIR);
        const now = Date.now();
        
        for (const file of files) {
          if (!file.endsWith(".md")) continue;
          
          const filePath = path.join(PLANS_TMP_DIR, file);
          const stats = await fs.promises.stat(filePath).catch(() => null);
          
          if (stats && now - stats.mtimeMs > MAX_AGE_MS) {
            await fs.promises.unlink(filePath).catch(() => {});
          }
        }
      } catch {
        // Best-effort, non-blocking - ignore errors
      }
    }

### Step 2: Extend Shared Types

Edit `apps/desktop/src/shared/tabs-types.ts`:

    // Add to PaneType
    export type PaneType = "terminal" | "webview" | "file-viewer" | "plan-viewer";
    
    // Add new interface
    export interface PlanViewerState {
      content: string;
      planId: string;
      originPaneId: string;       // For future Phase 2 response
      status: 'pending';          // Future: 'approved' | 'rejected'
      summary?: string;
      submittedAt: number;
      agentType?: 'opencode' | 'claude';
    }
    
    // Add to Pane interface
    export interface Pane {
      // ...existing fields
      planViewer?: PlanViewerState;
    }

Edit `apps/desktop/src/shared/constants.ts`:

    export const NOTIFICATION_EVENTS = {
      AGENT_COMPLETE: 'agent_complete',
      FOCUS_TAB: 'focus_tab',
      PLAN_SUBMITTED: 'plan_submitted',
    };

### Step 3: Add Factory Function

Edit `apps/desktop/src/renderer/stores/tabs/utils.ts`:

    export interface CreatePlanViewerPaneOptions {
      content: string;
      planId: string;
      originPaneId: string;
      summary?: string;
      agentType?: 'opencode' | 'claude';
    }
    
    export const createPlanViewerPane = (
      tabId: string,
      options: CreatePlanViewerPaneOptions,
    ): Pane => {
      const id = generateId("pane");
      
      // Extract title from first heading or use summary
      const titleMatch = options.content.match(/^#\s+(.+)$/m);
      const title = titleMatch?.[1]?.slice(0, 40) || options.summary?.slice(0, 30) || "Plan";
      
      return {
        id,
        tabId,
        type: "plan-viewer",
        name: title,
        needsAttention: true,  // Highlight that plan needs review
        planViewer: {
          content: options.content,
          planId: options.planId,
          originPaneId: options.originPaneId,
          status: 'pending',
          summary: options.summary,
          submittedAt: Date.now(),
          agentType: options.agentType,
        },
      };
    };

### Step 4: Update Store Persistence

Edit `apps/desktop/src/renderer/stores/tabs/store.ts`:

Update the persist middleware to exclude plan-viewer panes AND their layout references:

    import { removePaneFromLayout } from "./utils";
    
    // Helper to filter plan-viewer panes from layouts
    const filterPlanViewerFromLayout = (
      layout: MosaicNode<string>,
      planPaneIds: Set<string>
    ): MosaicNode<string> | null => {
      let result = layout;
      for (const paneId of planPaneIds) {
        const filtered = removePaneFromLayout(result, paneId);
        if (!filtered) return null;
        result = filtered;
      }
      return result;
    };
    
    persist(
      (set, get) => ({ ... }),
      {
        name: "tabs-storage",
        storage: trpcTabsStorage,
        partialize: (state) => {
          // Find all plan-viewer pane IDs
          const planPaneIds = new Set(
            Object.entries(state.panes)
              .filter(([_, pane]) => pane.type === 'plan-viewer')
              .map(([id]) => id)
          );
          
          // Filter panes
          const filteredPanes = Object.fromEntries(
            Object.entries(state.panes).filter(
              ([_, pane]) => pane.type !== 'plan-viewer'
            )
          );
          
          // Filter layouts to remove dangling plan-viewer references
          const filteredTabs = state.tabs.map(tab => ({
            ...tab,
            layout: filterPlanViewerFromLayout(tab.layout, planPaneIds) || tab.layout,
          }));
          
          // Filter focusedPaneIds to remove plan-viewer references
          const filteredFocusedPaneIds = Object.fromEntries(
            Object.entries(state.focusedPaneIds).filter(
              ([_, paneId]) => !planPaneIds.has(paneId)
            )
          );
          
          return {
            ...state,
            tabs: filteredTabs,
            panes: filteredPanes,
            focusedPaneIds: filteredFocusedPaneIds,
          };
        },
      },
    )

Add `addPlanViewerPane` action (similar to `addFileViewerPane` but no focus):

    addPlanViewerPane: (workspaceId, options) => {
      const state = get();
      const activeTabId = state.activeTabIds[workspaceId];
      const activeTab = state.tabs.find((t) => t.id === activeTabId);
      if (!activeTab) return "";
      
      // Look for existing unlocked plan-viewer pane to reuse
      const tabPaneIds = extractPaneIdsFromLayout(activeTab.layout);
      const planViewerPanes = tabPaneIds
        .map((id) => state.panes[id])
        .filter((p) => p?.type === "plan-viewer" && !p.planViewer?.isLocked);
      
      if (planViewerPanes.length > 0) {
        // Reuse existing pane
        const paneToReuse = planViewerPanes[0];
        set({
          panes: {
            ...state.panes,
            [paneToReuse.id]: createPlanViewerPane(activeTab.id, options),
          },
        });
        return paneToReuse.id;
      }
      
      // Create new pane (no focus change!)
      const newPane = createPlanViewerPane(activeTab.id, options);
      const newLayout = { direction: "row", first: activeTab.layout, second: newPane.id, splitPercentage: 50 };
      
      set({
        tabs: state.tabs.map((t) => t.id === activeTab.id ? { ...t, layout: newLayout } : t),
        panes: { ...state.panes, [newPane.id]: newPane },
        // NOTE: Do NOT update focusedPaneIds - don't steal focus
      });
      
      return newPane.id;
    }

### Step 5: Create PlanViewerPane Component

Create `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/PlanViewerPane/PlanViewerPane.tsx`:

    import { MosaicWindow } from "react-mosaic-component";
    import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
    import { Badge } from "@superset/ui/badge";
    import { formatDistanceToNow } from "date-fns";
    // ... imports
    
    export function PlanViewerPane({ pane, path, isActive, ... }) {
      const planViewer = pane.planViewer;
      if (!planViewer) return null;
      
      const timeAgo = formatDistanceToNow(planViewer.submittedAt, { addSuffix: true });
      
      return (
        <MosaicWindow path={path} title="" renderToolbar={() => (
          <div className="flex items-center justify-between px-2 w-full h-full">
            <span className="text-xs font-medium truncate">{pane.name}</span>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">{timeAgo}</Badge>
              {/* Lock and close buttons */}
            </div>
          </div>
        )}>
          <div className="h-full overflow-auto p-4">
            <MarkdownRenderer content={planViewer.content} style="tufte" />
          </div>
        </MosaicWindow>
      );
    }

### Step 6: Wire Up Component in TabsContent

Edit `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabsContent.tsx`:

In `renderTile()`, add case for plan-viewer:

    if (pane.type === "plan-viewer") {
      return (
        <PlanViewerPane
          paneId={paneId}
          path={path}
          pane={pane}
          isActive={isActive}
          tabId={tabId}
          removePane={removePane}
          setFocusedPane={setFocusedPane}
        />
      );
    }

### Step 7: Extend Agent Hooks for Plan Submission

**Claude Code: Extend the hook handler**

In `apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts`, update the Claude Code hook handler to intercept `ExitPlanMode`:

```typescript
// Add to the existing hook handling code
async function handleClaudeCodePermissionRequest(event: HookEvent): Promise<HookResponse> {
  // Check for ExitPlanMode (plan submission)
  if (event.permission?.name === 'ExitPlanMode') {
    const plan = event.tool_input?.plan;

    if (plan && typeof plan === 'string') {
      const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const plansDir = process.env.SUPERSET_PLANS_DIR;

      if (plansDir) {
        await fs.mkdir(plansDir, { recursive: true });
        const planPath = path.join(plansDir, `${planId}.md`);
        await fs.writeFile(planPath, plan, 'utf-8');

        // Notify main process
        const notifyScript = process.env.SUPERSET_NOTIFY_SCRIPT;
        if (notifyScript) {
          const payload = JSON.stringify({
            type: 'plan_submitted',
            planId,
            planPath,
            originPaneId: process.env.SUPERSET_TAB_ID,
            agentType: 'claude',
          });
          execSync(`bash "${notifyScript}" '${payload}'`);
        }
      }
    }

    // Allow ExitPlanMode to proceed
    return { behavior: 'allow' };
  }

  // Handle other permissions...
  return { behavior: 'allow' };
}
```

**OpenCode: Create the plugin**

Create `apps/desktop/src/main/lib/agent-plugins/opencode-plan/index.ts`:

```typescript
// OpenCode plugin for plan submission (follows Plannotator pattern)
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

const PLANS_DIR = process.env.SUPERSET_PLANS_DIR || path.join(process.env.HOME || '', '.superset', 'tmp', 'plans');
const NOTIFY_SCRIPT = process.env.SUPERSET_NOTIFY_SCRIPT;

export default {
  name: '@superset/opencode-plan',
  version: '1.0.0',

  tools: {
    submit_plan: {
      description: 'Submit an implementation plan for visual review in Superset.',
      parameters: {
        type: 'object',
        properties: {
          plan: { type: 'string', description: 'The full markdown plan content' },
          summary: { type: 'string', description: 'Brief one-line summary' },
        },
        required: ['plan'],
      },

      async execute({ plan, summary }: { plan: string; summary?: string }) {
        const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        await fs.mkdir(PLANS_DIR, { recursive: true });
        const planPath = path.join(PLANS_DIR, `${planId}.md`);
        await fs.writeFile(planPath, plan, 'utf-8');

        if (NOTIFY_SCRIPT) {
          const payload = JSON.stringify({
            type: 'plan_submitted',
            planId,
            planPath,
            summary,
            originPaneId: process.env.SUPERSET_TAB_ID,
            agentType: 'opencode',
          });
          execSync(`bash "${NOTIFY_SCRIPT}" '${payload}'`);
        }

        return 'Plan submitted successfully. It is now displayed in Superset for review.';
      },
    },
  },
};
```

**Update wrapper scripts** to pass required environment variables (both agents need `SUPERSET_PLANS_DIR` and `SUPERSET_NOTIFY_SCRIPT`).

### Step 8: Handle Plan Notification in Main Process

Edit `apps/desktop/src/main/lib/notifications/server.ts` (or equivalent):

    import { validateAndReadPlanFile } from "../plans/validate";
    import { notificationsEmitter } from "./emitter";
    import { NOTIFICATION_EVENTS } from "shared/constants";
    
    // In the notification handler, add case for plan_submitted:
    
    if (data.type === "plan_submitted") {
      const { planId, planPath, summary, originPaneId, agentType } = data;
      
      // Validate and read plan file securely
      const result = await validateAndReadPlanFile(planPath);
      
      if (!result.ok) {
        console.warn(`[notifications] Invalid plan file: ${result.error}`);
        return;
      }
      
      // Emit to renderer via tRPC subscription
      notificationsEmitter.emit(NOTIFICATION_EVENTS.PLAN_SUBMITTED, {
        content: result.content,
        planId,
        summary,
        originPaneId,
        agentType,
      });
      
      return;
    }

Also call cleanup on app start in `apps/desktop/src/main/index.ts`:

    import { cleanupOldPlanFiles } from "./lib/plans/cleanup";
    
    app.whenReady().then(async () => {
      // Best-effort cleanup of old plan files
      cleanupOldPlanFiles();
      
      // ... rest of app initialization
    });

### Step 9: Handle Event in Renderer

Edit `apps/desktop/src/renderer/stores/tabs/useAgentHookListener.ts`:

Add handler for `PLAN_SUBMITTED`:

    if (event.type === NOTIFICATION_EVENTS.PLAN_SUBMITTED) {
      const { content, planId, summary, originPaneId, agentType } = event.data;
      
      state.addPlanViewerPane(workspaceId, {
        content,
        planId,
        originPaneId,
        summary,
        agentType,
      });
    }

## Validation and Acceptance

### Acceptance Criteria

1. **Plan appears automatically**: When running `opencode` in a Superset terminal and the agent calls `submit_plan`, a new pane opens showing the plan in Tufte-styled markdown.

2. **Plan renders correctly**: Code blocks, headings, lists, and other markdown elements render properly with syntax highlighting.

3. **Pane integrates with layout**: The plan pane behaves like other panes - can be split, moved, closed, locked.

4. **No regression**: Existing file-viewer and terminal panes continue to work.

### Validation Steps

1. Start dev mode:
   
        bun run dev
        cd apps/desktop && bun run dev

2. Open the desktop app and create a workspace

3. Open a terminal and run:
   
        opencode

4. Have the agent create a plan and call `submit_plan`

5. Verify:
   - A new pane appears with the plan content
   - Markdown renders with Tufte styling
   - Pane can be closed, locked, split
   - Terminal pane still functions normally

6. Run type check:
   
        bun run typecheck

7. Run lint:
   
        bun run lint

## Idempotence and Recovery

- All changes are additive (new types, new component, new action)
- No migrations required
- No database changes
- If implementation fails partway, unused types and components can be deleted

## Artifacts and Notes

### Reference: Plannotator Architecture

From the Plannotator project analysis:

- Uses ephemeral Bun server to serve plan UI
- Annotation types: DELETION, INSERTION, REPLACEMENT, COMMENT, GLOBAL_COMMENT
- Plan is parsed into blocks: heading, paragraph, code, list-item, blockquote, table
- URL sharing via deflate compression in hash
- `web-highlighter` library for text selection and annotation

This informs future phases (annotation support) but is not needed for Phase 1.

### Reference: Existing MarkdownRenderer Usage

    <MarkdownRenderer 
      content={rawFileData.content}
      style="tufte"  // or "default"
    />

The component accepts `content` string and optional `style` prop.

### Temp File Approach Rationale

Why temp files instead of passing content directly:

1. **Payload size**: Plans can be large (10KB+). Querystrings have limits (~2KB), IPC has memory overhead.
2. **Reliability**: File paths are tiny strings that always fit in any transport.
3. **Debuggability**: Can inspect plan files on disk for troubleshooting.
4. **Cleanup**: Simple mtime-based cleanup policy (delete files > 24h old).
5. **Security**: Main process validates path before reading, preventing arbitrary file access.

File location: `~/.superset/tmp/plans/{planId}.md`
- Owned by Superset (not shared `/tmp`)
- Easy to find and clean up
- Per-user isolation

### Agent Integration Reference

Both agents are integrated using their native hook/plugin patterns (matching Plannotator's approach):

**Claude Code: ExitPlanMode Hook**

When Claude Code exits plan mode, it fires a `PermissionRequest` event:

```typescript
interface ExitPlanModeEvent {
  type: 'PermissionRequest';
  permission: { name: 'ExitPlanMode' };
  tool_input: {
    plan: string;  // Full markdown plan content
  };
}
```

The hook handler reads `tool_input.plan`, writes to temp file, and notifies main process.

**OpenCode: Plugin with submit_plan Tool**

OpenCode plugin registers a `submit_plan` tool:

```typescript
{
  name: 'submit_plan',
  description: 'Submit an implementation plan for visual review in Superset.',
  parameters: {
    type: 'object',
    properties: {
      plan: { type: 'string', description: 'Full markdown plan content' },
      summary: { type: 'string', description: 'Brief one-line summary' },
    },
    required: ['plan'],
  },
}
```

When called, the plugin writes plan to temp file and notifies main process.

**Reference: Plannotator**

This integration pattern is proven by Plannotator (https://github.com/backnotprop/plannotator) which has working implementations for both Claude Code and OpenCode.

## Interfaces and Dependencies

### New Types (in shared/tabs-types.ts)

    interface PlanViewerState {
      content: string;
      planId: string;
      originPaneId: string;
      status: 'pending';  // Future: | 'approved' | 'rejected'
      summary?: string;
      submittedAt: number;
      agentType?: 'opencode' | 'claude';
      isLocked?: boolean;  // Prevent pane reuse
    }

### New Store Actions (in tabs/store.ts)

    addPlanViewerPane: (
      workspaceId: string,
      options: {
        content: string;
        planId: string;
        originPaneId: string;
        summary?: string;
        agentType?: 'opencode' | 'claude';
      }
    ) => string;  // returns paneId

### New Component (PlanViewerPane)

    interface PlanViewerPaneProps {
      paneId: string;
      path: MosaicBranch[];
      pane: Pane;
      isActive: boolean;
      tabId: string;
      removePane: (paneId: string) => void;
      setFocusedPane: (tabId: string, paneId: string) => void;
    }

### Notification Event Shape (from plugin to main)

    // Sent by OpenCode plugin via notify.sh
    interface PlanSubmittedNotification {
      type: 'plan_submitted';
      planId: string;
      planPath: string;  // File path, not content
      summary?: string;
      originPaneId: string;
      agentType: 'opencode' | 'claude';
    }

### tRPC Event Shape (main to renderer)

    // Emitted via tRPC subscription after main reads file
    interface PlanSubmittedEvent {
      type: 'plan_submitted';
      data: {
        content: string;  // Full markdown content (read from file)
        planId: string;
        originPaneId: string;
        summary?: string;
        agentType: 'opencode' | 'claude';
      };
    }

### Event Routing

1. **Constants** (`apps/desktop/src/shared/constants.ts`):
   Add `PLAN_SUBMITTED: 'plan_submitted'` to `NOTIFICATION_EVENTS`

2. **Emitter** (`apps/desktop/src/main/lib/notifications/emitter.ts`):
   Existing `notificationsEmitter` EventEmitter - no changes needed

3. **tRPC Router** (`apps/desktop/src/lib/trpc/routers/notifications.ts`):
   Add `PLAN_SUBMITTED` case to the subscription observable

4. **Renderer Handler** (`apps/desktop/src/renderer/stores/tabs/useAgentHookListener.ts`):
   Add handler for `NOTIFICATION_EVENTS.PLAN_SUBMITTED`

### New Files

    apps/desktop/src/main/lib/plans/
    ├── paths.ts           # PLANS_TMP_DIR constant
    ├── cleanup.ts         # Delete old plan files
    └── validate.ts        # Validate plan file paths

    apps/desktop/src/main/lib/agent-plugins/opencode-plan/
    └── index.ts           # OpenCode plugin with submit_plan tool

    apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/PlanViewerPane/
    ├── PlanViewerPane.tsx
    └── index.ts

### Dependencies

**No new npm dependencies required.** Uses existing:
- `react-mosaic-component` for pane layout
- `date-fns` for timestamp formatting (already in project)
- `MarkdownRenderer` for Tufte rendering

The agent integrations use native hook/plugin patterns - no external SDKs needed.

---

# Phase 2: Approve / Request Changes - Detailed Implementation Plan

## Overview

Phase 2 adds the ability to approve or reject plans with feedback. When a user makes a decision, the response is sent back to the waiting agent hook, allowing the agent to either proceed with implementation (approve) or revise the plan (reject with feedback).

## Key Insight: Superset's Advantage Over Plannotator

Plannotator uses an **ephemeral HTTP server** pattern because it runs outside the app - it spawns a Bun server, opens a browser, waits for a decision, then shuts down.

Superset is **already inside Electron** with established communication channels:
- tRPC for renderer ↔ main process communication
- `originPaneId` already tracks which terminal submitted the plan
- Shared file system for IPC with external processes (agent hooks)

**Architecture Decision: Response File Polling**

We use **response files** for agent ↔ Superset communication because:
- Agent hooks run as external processes (bash scripts, Node tools) - they can't receive tRPC calls
- Terminal stdin can't reliably reach the hook process (it goes to the shell, not the hook)
- Response files are simple, cross-platform, and debuggable

```
PlanViewerPane (UI)
    → tRPC mutation (plans.submitResponse)
    → Main process validates & writes response file
    → Agent hook polls for response file
    → Hook reads response and returns to agent
```

## Architecture

### Response Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                   APPROVE/REJECT FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User clicks "Approve" or "Request Changes" in PlanViewerPane  │
│         ↓                                                         │
│  Renderer calls: trpc.plans.submitResponse.mutate({             │
│    planId, originPaneId, decision, feedback                     │
│  })                                                              │
│         ↓                                                         │
│  Main process:                                                   │
│    1. Validates planId matches PLAN_ID_PATTERN                  │
│    2. Checks *.waiting sentinel exists (agent still waiting)    │
│    3. Writes response atomically (*.tmp → rename to *.response) │
│    4. Emits PLAN_RESPONSE event (updates UI status)             │
│         ↓                                                         │
│  Agent hook (polling in background):                            │
│    - Detects *.response file                                    │
│    - Reads and deletes response + waiting sentinel              │
│    - Returns decision to agent                                  │
│         ↓                                                         │
│  Renderer updates PlanViewerPane:                               │
│    - status: 'approved' | 'rejected'                            │
│    - Visual indicator (green checkmark / yellow warning)        │
│    - Buttons disabled after decision                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Response File Protocol

**Files involved per plan:**
- `{planId}.md` - The plan content (written by agent hook)
- `{planId}.waiting` - Structured JSON sentinel (see format below)
- `{planId}.response` - User's decision (written by main process)

**`.waiting` file format (JSON):**
```json
{
  "pid": 12345,
  "token": "a1b2c3d4e5f6",
  "createdAt": 1704369600000,
  "originPaneId": "pane-abc123",
  "agentType": "claude"
}
```

The `token` is a random string generated by the agent. The response file must include this same token to prevent stale/cross-plan responses.

**`.response` file format (JSON):**
```json
{
  "decision": "approved",
  "feedback": "...",
  "token": "a1b2c3d4e5f6"
}
```

**Protocol guarantees:**
1. **Token validation**: Response must include matching token from `.waiting` file
2. **Exclusive-create writes**: Main process uses `fs.open(..., 'wx')` to prevent race overwrites
3. **Idempotency**: `submitResponse` rejects if `.response` already exists
4. **Stale detection**: UI validates `.waiting` file exists AND token matches before allowing response
5. **Order guarantee**: Agent creates `.waiting` BEFORE notifying Superset (prevents fast-approval race)
6. **Cleanup**: All three file types cleaned up after 24h or on decision

### Agent Response Handling

**Claude Code (ExitPlanMode hook):**

The hook blocks and polls for a response file. **Critical: Create `.waiting` BEFORE notifying Superset.**

```bash
# In plan-hook.sh
RESPONSE_FILE="$PLANS_DIR/$PLAN_ID.response"
WAITING_FILE="$PLANS_DIR/$PLAN_ID.waiting"

# Generate random token for request/response matching
TOKEN=$(head -c 16 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 12)

# IMPORTANT: Create waiting sentinel BEFORE notifying Superset
# This prevents race where fast UI response arrives before we're listening
cat > "$WAITING_FILE" << EOF
{
  "pid": $$,
  "token": "$TOKEN",
  "createdAt": $(date +%s)000,
  "originPaneId": "$SUPERSET_PANE_ID",
  "agentType": "claude"
}
EOF

# NOW notify Superset (after .waiting exists)
curl -s -X POST "http://127.0.0.1:$SUPERSET_NOTIFICATION_PORT/hook/plan" \
  -H "Content-Type: application/json" \
  -d "{\"planId\": \"$PLAN_ID\", \"planPath\": \"$PLAN_PATH\", \"token\": \"$TOKEN\", ...}"

# Wait for response (with timeout)
TIMEOUT=1800  # 30 minutes
ELAPSED=0

while [ $ELAPSED -lt $TIMEOUT ]; do
  if [ -f "$RESPONSE_FILE" ]; then
    RESPONSE=$(cat "$RESPONSE_FILE")

    # Validate token matches (prevents stale/cross-plan responses)
    RESPONSE_TOKEN=$(echo "$RESPONSE" | jq -r '.token // empty')
    if [ "$RESPONSE_TOKEN" != "$TOKEN" ]; then
      # Token mismatch - ignore stale response, keep waiting
      rm -f "$RESPONSE_FILE"
      sleep 1
      ELAPSED=$((ELAPSED + 1))
      continue
    fi

    rm -f "$RESPONSE_FILE" "$WAITING_FILE"
    echo "$RESPONSE"  # Output to Claude
    exit 0
  fi
  sleep 1
  ELAPSED=$((ELAPSED + 1))
done

# Cleanup and timeout
rm -f "$WAITING_FILE"

# IMPORTANT: Timeout behavior is configurable
# Default: deny (safer - requires explicit approval)
# Alternative: allow (more permissive - auto-proceed on timeout)
jq -n '{behavior: "deny", message: "Plan review timed out. Please resubmit for approval."}'
```

**Timeout Semantics Decision:**

| Behavior | Pros | Cons |
|----------|------|------|
| `deny` on timeout | Safer; approval is a real gate | User must actively respond |
| `allow` on timeout | Convenient; unblocks stuck sessions | Undermines approval as control |

**Recommendation:** Default to `deny` for production use. Consider a user preference for timeout behavior.

**OpenCode (submit_plan tool):**

Similar pattern with waiting sentinel:

```typescript
async execute({ plan, summary }) {
  const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const planPath = path.join(plansTmpDir, `${planId}.md`);
  const waitingPath = path.join(plansTmpDir, `${planId}.waiting`);
  const responsePath = path.join(plansTmpDir, `${planId}.response`);

  await fs.mkdir(plansTmpDir, { recursive: true });

  // Write plan content
  await fs.writeFile(planPath, plan, 'utf-8');

  // Create waiting sentinel (stores our PID for debugging)
  await fs.writeFile(waitingPath, String(process.pid), 'utf-8');

  // Notify Superset
  await fetch(`http://127.0.0.1:${notificationPort}/hook/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      planId, planPath, summary,
      originPaneId: process.env.SUPERSET_PANE_ID || '',
      workspaceId: process.env.SUPERSET_WORKSPACE_ID || '',
      agentType: 'opencode',
    }),
  });

  // Wait for response (poll with timeout)
  const timeout = 30 * 60 * 1000; // 30 minutes
  const startTime = Date.now();

  try {
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fs.readFile(responsePath, 'utf-8');
        // Cleanup all files
        await Promise.all([
          fs.unlink(responsePath).catch(() => {}),
          fs.unlink(waitingPath).catch(() => {}),
        ]);

        const parsed = JSON.parse(response);
        if (parsed.decision === 'approved') {
          return 'Plan approved! Proceeding with implementation.';
        } else {
          return `Plan needs revision. User feedback:\n\n${parsed.feedback || 'No specific feedback provided.'}`;
        }
      } catch {
        // File doesn't exist yet, keep waiting
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Timeout - cleanup and report
    await fs.unlink(waitingPath).catch(() => {});
    return 'Plan review timed out. The user did not respond within 30 minutes.';
  } catch (error) {
    // Ensure cleanup on any error
    await fs.unlink(waitingPath).catch(() => {});
    throw error;
  }
}
```

## Milestones

### Milestone 2.1: Extend PlanViewerState

**In `apps/desktop/src/shared/tabs-types.ts`:**

```typescript
export interface PlanViewerState {
  // ... existing fields
  status: 'pending' | 'approved' | 'rejected';
  feedback?: string;        // User's feedback when rejecting
  respondedAt?: number;     // When decision was made
}
```

### Milestone 2.2: Create DecisionBar Component

**Create `apps/desktop/src/renderer/.../PlanViewerPane/DecisionBar/DecisionBar.tsx`:**

```typescript
interface DecisionBarProps {
  planId: string;
  originPaneId: string;
  status: 'pending' | 'approved' | 'rejected';
  onApprove: () => void;
  onReject: (feedback: string) => void;
  isSubmitting: boolean;
}

export function DecisionBar({
  planId,
  originPaneId,
  status,
  onApprove,
  onReject,
  isSubmitting,
}: DecisionBarProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');

  if (status !== 'pending') {
    // Show status indicator instead of buttons
    return (
      <div className="flex items-center gap-2 px-4 py-2 border-t">
        {status === 'approved' ? (
          <>
            <HiCheckCircle className="text-green-500" />
            <span className="text-sm text-muted-foreground">Plan approved</span>
          </>
        ) : (
          <>
            <HiExclamationCircle className="text-yellow-500" />
            <span className="text-sm text-muted-foreground">Changes requested</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="border-t bg-muted/30">
      {showFeedback ? (
        <div className="p-3 space-y-2">
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Describe what changes you'd like..."
            className="min-h-[80px]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowFeedback(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => onReject(feedback)}
              disabled={!feedback.trim() || isSubmitting}
            >
              {isSubmitting ? 'Sending...' : 'Send Feedback'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-2 px-3 py-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFeedback(true)}
            disabled={isSubmitting}
          >
            Request Changes
          </Button>
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-500"
            onClick={onApprove}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Approving...' : 'Approve'}
          </Button>
        </div>
      )}
    </div>
  );
}
```

### Milestone 2.3: Create tRPC Router for Plan Responses

**Create `apps/desktop/src/lib/trpc/routers/plans.ts`:**

```typescript
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { publicProcedure, router } from '..';
import { notificationsEmitter } from 'main/lib/notifications/server';
import { NOTIFICATION_EVENTS } from 'shared/constants';
import { PLANS_TMP_DIR, PLAN_ID_PATTERN } from 'main/lib/plans';
import fs from 'node:fs/promises';
import { open, constants } from 'node:fs';
import path from 'node:path';

// Security: Size limits to prevent abuse
const MAX_FEEDBACK_SIZE = 50 * 1024; // 50KB
const MAX_SUMMARY_SIZE = 2 * 1024;   // 2KB

// Type for structured .waiting file
interface WaitingFile {
  pid: number;
  token: string;
  createdAt: number;
  originPaneId: string;
  agentType: string;
}

export const createPlansRouter = () => {
  return router({
    submitResponse: publicProcedure
      .input(z.object({
        planId: z.string(),
        planPath: z.string(),           // For validation against planId
        originPaneId: z.string(),
        token: z.string(),              // Must match .waiting file token
        decision: z.enum(['approved', 'rejected']),
        feedback: z.string().max(MAX_FEEDBACK_SIZE).optional(),
      }))
      .mutation(async ({ input }) => {
        const { planId, planPath, originPaneId, token, decision, feedback } = input;

        // Security: Validate planId format (prevent path traversal)
        if (!PLAN_ID_PATTERN.test(planId)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid plan ID format',
          });
        }

        // Security: Validate planId matches planPath basename
        const expectedBasename = `${planId}.md`;
        if (path.basename(planPath) !== expectedBasename) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Plan ID does not match plan path',
          });
        }

        const waitingPath = path.join(PLANS_TMP_DIR, `${planId}.waiting`);
        const responsePath = path.join(PLANS_TMP_DIR, `${planId}.response`);

        // Read and validate .waiting file
        let waitingData: WaitingFile;
        try {
          const content = await fs.readFile(waitingPath, 'utf-8');
          waitingData = JSON.parse(content);
        } catch {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Agent is no longer waiting for a response',
          });
        }

        // Security: Validate token matches (prevents stale/cross-plan responses)
        if (waitingData.token !== token) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Token mismatch - request may be stale',
          });
        }

        // Build response for agent (include token for agent-side validation)
        const response = {
          decision,
          token,
          behavior: decision === 'approved' ? 'allow' : 'deny',
          ...(feedback && { feedback }),
        };

        // Exclusive-create write: prevents race condition overwrites
        // O_CREAT | O_EXCL | O_WRONLY = fail if file already exists
        try {
          const fd = await new Promise<number>((resolve, reject) => {
            open(responsePath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o644, (err, fd) => {
              if (err) reject(err);
              else resolve(fd);
            });
          });

          // Write and close
          const content = JSON.stringify(response);
          await fs.writeFile(fd, content, 'utf-8');
          await fs.close(fd);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Response already submitted for this plan',
            });
          }
          throw error;
        }

        // Emit event to update UI
        notificationsEmitter.emit(NOTIFICATION_EVENTS.PLAN_RESPONSE, {
          planId,
          decision,
          feedback,
        });

        return { success: true };
      }),

    // Endpoint for agent hooks to register plans (validates token for CSRF protection)
    registerPlan: publicProcedure
      .input(z.object({
        planId: z.string(),
        planPath: z.string(),
        summary: z.string().max(MAX_SUMMARY_SIZE),
        originPaneId: z.string(),
        workspaceId: z.string(),
        agentType: z.enum(['claude', 'opencode']),
        token: z.string(),
        installSecret: z.string(),  // Per-install secret for CSRF protection
      }))
      .mutation(async ({ input }) => {
        // Validate install secret (set during Superset installation)
        const expectedSecret = process.env.SUPERSET_INSTALL_SECRET;
        if (!expectedSecret || input.installSecret !== expectedSecret) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Invalid install secret',
          });
        }

        // ... rest of registration logic
      }),
  });
};
```

### Milestone 2.4: Update Agent Hooks for Response Handling

**Update Claude Code plan hook (`apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts`):**

```bash
#!/bin/bash
# Superset plan hook for Claude Code - Phase 2
# Waits for user decision before returning to Claude

[ -z "$SUPERSET_TAB_ID" ] && { echo '{"behavior":"allow"}'; exit 0; }

INPUT=$(cat)
PLAN=$(echo "$INPUT" | jq -r '.tool_input.plan // empty')

if [ -n "$PLAN" ] && [ "$PLAN" != "null" ]; then
  PLAN_ID="plan-$(date +%s)-$RANDOM"
  PLANS_DIR="${plansTmpDir}"
  mkdir -p "$PLANS_DIR"

  PLAN_PATH="$PLANS_DIR/$PLAN_ID.md"
  RESPONSE_PATH="$PLANS_DIR/$PLAN_ID.response"

  echo "$PLAN" > "$PLAN_PATH"

  # Notify Superset
  curl -sX POST "http://127.0.0.1:${notificationPort}/hook/plan" \
    -H "Content-Type: application/json" \
    --connect-timeout 1 --max-time 2 \
    -d "{
      \"planId\": \"$PLAN_ID\",
      \"planPath\": \"$PLAN_PATH\",
      \"originPaneId\": \"$SUPERSET_PANE_ID\",
      \"workspaceId\": \"$SUPERSET_WORKSPACE_ID\",
      \"agentType\": \"claude\"
    }" > /dev/null 2>&1

  # Wait for user decision (poll response file)
  TIMEOUT=1800  # 30 minutes
  ELAPSED=0

  while [ $ELAPSED -lt $TIMEOUT ]; do
    if [ -f "$RESPONSE_PATH" ]; then
      RESPONSE=$(cat "$RESPONSE_PATH")
      rm -f "$RESPONSE_PATH"

      DECISION=$(echo "$RESPONSE" | jq -r '.decision // "approved"')
      FEEDBACK=$(echo "$RESPONSE" | jq -r '.feedback // empty')

      if [ "$DECISION" = "approved" ]; then
        echo '{"behavior":"allow"}'
      else
        # Include feedback in deny message
        echo "{\"behavior\":\"deny\",\"message\":\"Plan changes requested:\\n\\n$FEEDBACK\"}"
      fi
      exit 0
    fi

    sleep 1
    ELAPSED=$((ELAPSED + 1))
  done

  # Timeout - allow by default
  echo '{"behavior":"allow"}'
else
  echo '{"behavior":"allow"}'
fi
```

**Update OpenCode plugin for response handling:**

```typescript
async execute({ plan, summary }) {
  const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const planPath = path.join(plansTmpDir, `${planId}.md`);
  const responsePath = path.join(plansTmpDir, `${planId}.response`);

  await fs.mkdir(plansTmpDir, { recursive: true });
  await fs.writeFile(planPath, plan, 'utf-8');

  // Notify Superset
  await fetch(`http://127.0.0.1:${notificationPort}/hook/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      planId,
      planPath,
      summary,
      originPaneId: process.env.SUPERSET_PANE_ID || '',
      workspaceId: process.env.SUPERSET_WORKSPACE_ID || '',
      agentType: 'opencode',
    }),
  });

  // Wait for response (poll with timeout)
  const startTime = Date.now();
  const timeout = 30 * 60 * 1000; // 30 minutes

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fs.readFile(responsePath, 'utf-8');
      await fs.unlink(responsePath);

      const parsed = JSON.parse(response);
      if (parsed.decision === 'approved') {
        return 'Plan approved! Proceeding with implementation.';
      } else {
        return `Plan needs revision. User feedback:\n\n${parsed.feedback || 'No specific feedback provided.'}`;
      }
    } catch {
      // File doesn't exist yet, keep waiting
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Timeout - inform user
  return 'Plan review timed out. You may proceed with implementation or ask the user for feedback.';
}
```

### Milestone 2.5: Update PlanViewerPane with DecisionBar

**Update `PlanViewerPane.tsx`:**

```typescript
export function PlanViewerPane({ paneId, path, pane, ... }) {
  const planViewer = pane.planViewer;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitResponse = trpc.plans.submitResponse.useMutation();

  const handleApprove = async () => {
    if (!planViewer) return;
    setIsSubmitting(true);
    try {
      await submitResponse.mutateAsync({
        planId: planViewer.planId,
        originPaneId: planViewer.originPaneId,
        decision: 'approved',
      });
      // Update local state
      updatePlanStatus(paneId, 'approved');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async (feedback: string) => {
    if (!planViewer) return;
    setIsSubmitting(true);
    try {
      await submitResponse.mutateAsync({
        planId: planViewer.planId,
        originPaneId: planViewer.originPaneId,
        decision: 'rejected',
        feedback,
      });
      updatePlanStatus(paneId, 'rejected', feedback);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MosaicWindow ...>
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-auto p-4">
          <MarkdownRenderer content={planViewer.content} />
        </div>
        <DecisionBar
          planId={planViewer.planId}
          originPaneId={planViewer.originPaneId}
          status={planViewer.status}
          onApprove={handleApprove}
          onReject={handleReject}
          isSubmitting={isSubmitting}
        />
      </div>
    </MosaicWindow>
  );
}
```

### Milestone 2.6: Add PLAN_RESPONSE Event Handling

**Update `apps/desktop/src/shared/constants.ts`:**

```typescript
export const NOTIFICATION_EVENTS = {
  AGENT_COMPLETE: 'agent-complete',
  FOCUS_TAB: 'focus-tab',
  PLAN_SUBMITTED: 'plan-submitted',
  PLAN_RESPONSE: 'plan-response',  // NEW
} as const;
```

**Update notifications router to emit PLAN_RESPONSE:**

Add handler in `useAgentHookListener.ts` to update plan status when response is sent.

## New Files (Phase 2)

```
apps/desktop/src/
├── lib/trpc/routers/plans.ts           # New tRPC router
├── renderer/.../PlanViewerPane/
│   ├── DecisionBar/
│   │   ├── DecisionBar.tsx             # Approve/Reject UI
│   │   └── index.ts
│   └── PlanViewerPane.tsx              # Updated with DecisionBar
```

## Dependencies (Phase 2)

**No new npm dependencies.** Uses existing:
- `@superset/ui/button` and `@superset/ui/textarea` for UI
- tRPC patterns already established
- File-based response mechanism (no additional IPC)

## Security Considerations (Phase 2)

### Path Traversal Prevention
- **planId validation**: Always validate against `PLAN_ID_PATTERN` before constructing file paths
- **planId/planPath mismatch**: Verify `planId === basename(planPath).replace(".md","")` to prevent ID spoofing
- **Canonical paths**: Use `path.resolve()` + `realpath()` when reading plan files
- **Directory containment**: Ensure all plan files are within `PLANS_TMP_DIR`

### Localhost CSRF Mitigation

**Problem:** Any website can POST to `http://127.0.0.1:PORT/hook/plan`. CORS headers don't help because simple POST requests don't trigger preflight.

**Solution: Per-Install Secret Token**

```typescript
// Generated during Superset installation, stored in user config
const SUPERSET_INSTALL_SECRET = crypto.randomBytes(32).toString('hex');

// Agent hooks must include this secret in requests
curl -X POST "http://127.0.0.1:$PORT/hook/plan" \
  -H "Content-Type: application/json" \
  -d '{"installSecret": "$SUPERSET_INSTALL_SECRET", ...}'

// Server validates before processing
if (input.installSecret !== process.env.SUPERSET_INSTALL_SECRET) {
  throw new TRPCError({ code: 'UNAUTHORIZED' });
}
```

The secret is passed to agent hooks via environment variables (already established pattern with `SUPERSET_PANE_ID`).

### Token-Based Request/Response Matching

Each plan submission generates a random token stored in `.waiting`. The response must include this token to be accepted. This prevents:
- Stale responses from old/crashed agents
- Cross-plan response mixups
- Replay attacks

### Input Validation
- **Feedback size limit**: 50KB max to prevent memory abuse
- **Summary size limit**: 2KB max
- **planId format**: Alphanumeric + hyphens only (`/^plan-\d+-[a-z0-9]+$/`)
- **Idempotency**: Reject duplicate responses using exclusive-create (`O_EXCL`)

### File System Safety
- **Exclusive-create writes**: Use `O_CREAT | O_EXCL` to prevent race condition overwrites
- **Token in response**: Agent validates response token matches request token
- **Cleanup**: All file types (`.md`, `.waiting`, `.response`) cleaned after 24h
- **Permissions**: Plans directory under user's home, not world-readable

## Extended Cleanup (Phase 2)

**Update `apps/desktop/src/main/lib/plans/cleanup.ts`:**

```typescript
const CLEANUP_EXTENSIONS = ['.md', '.waiting', '.response'];

export async function cleanupOldPlanFiles(): Promise<void> {
  try {
    await fs.promises.mkdir(PLANS_TMP_DIR, { recursive: true });
    const files = await fs.promises.readdir(PLANS_TMP_DIR);
    const now = Date.now();

    for (const file of files) {
      // Clean all plan-related files, plus any orphaned .tmp files
      const isRelevant = CLEANUP_EXTENSIONS.some(ext => file.endsWith(ext))
        || file.includes('.tmp');

      if (!isRelevant) continue;

      const filePath = path.join(PLANS_TMP_DIR, file);
      const stats = await fs.promises.stat(filePath).catch(() => null);

      if (stats && now - stats.mtimeMs > MAX_AGE_MS) {
        await fs.promises.unlink(filePath).catch(() => {});
      }
    }
  } catch {
    console.log('[plans/cleanup] Cleanup skipped or failed');
  }
}
```

---

# Phase 3: Text Annotations - Detailed Implementation Plan

## Overview

Phase 3 adds Plannotator-style text annotations, allowing users to mark up plan text with deletions, replacements, comments, and insertions. Annotations are converted to structured feedback when rejecting a plan.

## ⚠️ Critical: React + web-highlighter Conflict

**Problem:** `web-highlighter` mutates the DOM directly by wrapping selected text in `<mark>` elements. React will **wipe these mutations** on any re-render of the markdown component.

**This requires a spike before full implementation.**

### Spike Tasks (Before Full Build)

1. **Verify web-highlighter works with ReactMarkdown**
   - Create a minimal test: render markdown, select text, add highlight
   - Trigger a state update (not related to highlights)
   - Check if highlights survive the re-render

2. **Test DOM stability approaches:**
   - **Option A: Memoize aggressively** - Wrap MarkdownRenderer in `React.memo` with stable props
   - **Option B: Uncontrolled container** - Render markdown once into a static HTML container outside React's control
   - **Option C: Hybrid** - Use React for initial render, then detach from React tree for annotations

3. **Handle multi-source selections**
   - Don't assume `sources[0]` is always sufficient
   - Test selections spanning multiple elements
   - Verify delete/restore works deterministically

4. **Test annotation persistence**
   - Save annotations to state
   - Re-render component
   - Verify annotations can be reapplied via `fromStore()`

### Recommended Approach

Based on Plannotator's implementation and React constraints:

```typescript
// Option B: Uncontrolled container with controlled data
// ⚠️ CRITICAL: Must reuse existing sanitize pipeline!

import { sanitizeHtml } from 'renderer/utils/sanitize'; // Existing sanitizer

function AnnotatableViewer({ content, annotations, onAddAnnotation }) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Render and sanitize markdown ONCE using existing pipeline
  const [initialHtml] = useState(() => {
    const rawHtml = renderMarkdownToHtml(content);
    return sanitizeHtml(rawHtml); // MUST sanitize - Electron XSS risk!
  });

  useEffect(() => {
    // Only set innerHTML once on mount
    if (containerRef.current && !containerRef.current.innerHTML) {
      containerRef.current.innerHTML = initialHtml;
    }
  }, [initialHtml]);

  // web-highlighter operates on the static DOM
  // React state tracks annotations, but doesn't re-render the markdown
}
```

## ⚠️ Critical: Sanitization in Uncontrolled Containers

**Problem:** Using `dangerouslySetInnerHTML` or `innerHTML` with untrusted markdown bypasses React's XSS protection. In Electron, XSS can lead to full system compromise.

**Requirements:**
1. **Reuse existing sanitize pipeline** - Don't create a new one; use what `MarkdownRenderer` already uses
2. **Sanitize BEFORE setting innerHTML** - Never set raw HTML from markdown
3. **Test with malicious input** - Include script tags, event handlers, data URIs in test cases
4. **Content Security Policy** - Ensure Electron's CSP blocks inline scripts as defense-in-depth

```typescript
// ❌ DANGEROUS
containerRef.current.innerHTML = renderMarkdownToHtml(content);

// ✅ SAFE
containerRef.current.innerHTML = sanitizeHtml(renderMarkdownToHtml(content));
```

## Key Insight: Selective Plannotator Integration

Plannotator uses `web-highlighter` for text selection. We should:
1. **Use web-highlighter** - proven library for cross-element text selection
2. **Simplify annotation types** - start with 3 (not 5): DELETION, COMMENT, REPLACEMENT
3. **Skip URL sharing** - we're in Electron, sharing via files is simpler
4. **Integrate with DecisionBar** - annotations auto-generate feedback for rejection
5. **Spike first** - validate React/DOM compatibility before full implementation

## Architecture

### Annotation Data Flow

```
User selects text in MarkdownRenderer
         ↓
web-highlighter fires CREATE event
         ↓
AnnotationToolbar appears at selection
         ↓
User chooses: Delete | Comment | Replace
         ↓
Annotation added to PlanViewerState.annotations[]
         ↓
Visual highlight applied to DOM
         ↓
AnnotationPanel shows annotation in sidebar
         ↓
On "Request Changes":
  - exportAnnotationsToFeedback() generates markdown
  - Feedback included in rejection response
```

### Annotation Types

```typescript
export enum AnnotationType {
  DELETION = 'DELETION',        // Mark text for removal
  REPLACEMENT = 'REPLACEMENT',  // Change text to something else
  COMMENT = 'COMMENT',          // Add feedback on selected text
}

export interface Annotation {
  id: string;
  type: AnnotationType;
  originalText: string;         // The selected text
  newText?: string;             // For REPLACEMENT
  comment?: string;             // For COMMENT
  createdAt: number;
  // web-highlighter metadata for DOM reconstruction
  startMeta?: HighlightMeta;
  endMeta?: HighlightMeta;
}

interface HighlightMeta {
  parentTagName: string;
  parentIndex: number;
  textOffset: number;
}
```

## Milestones

### Milestone 3.1: Add web-highlighter Dependency

```bash
cd apps/desktop
bun add web-highlighter
```

### Milestone 3.2: Extend PlanViewerState with Annotations

**Update `apps/desktop/src/shared/tabs-types.ts`:**

```typescript
export enum AnnotationType {
  DELETION = 'DELETION',
  REPLACEMENT = 'REPLACEMENT',
  COMMENT = 'COMMENT',
}

// Metadata for a single highlight source (from web-highlighter)
export interface HighlightSourceMeta {
  id: string;
  text: string;
  startMeta: {
    parentTagName: string;
    parentIndex: number;
    textOffset: number;
  };
  endMeta: {
    parentTagName: string;
    parentIndex: number;
    textOffset: number;
  };
}

export interface Annotation {
  id: string;
  type: AnnotationType;
  originalText: string;           // Combined text from all sources
  newText?: string;
  comment?: string;
  createdAt: number;
  // Multi-source support (selections spanning multiple elements)
  sourceMetas?: HighlightSourceMeta[];
  // Legacy single-source fields (for backward compat)
  startMeta?: {
    parentTagName: string;
    parentIndex: number;
    textOffset: number;
  };
  endMeta?: {
    parentTagName: string;
    parentIndex: number;
    textOffset: number;
  };
}

export interface PlanViewerState {
  // ... existing fields
  annotations: Annotation[];
}
```

### Milestone 3.3: Create AnnotatableViewer Component

Wraps MarkdownRenderer with web-highlighter integration.

**Create `apps/desktop/src/renderer/.../PlanViewerPane/AnnotatableViewer/AnnotatableViewer.tsx`:**

```typescript
import Highlighter from 'web-highlighter';
import { useEffect, useRef, useState, useCallback } from 'react';
import { MarkdownRenderer } from 'renderer/components/MarkdownRenderer';
import { AnnotationToolbar } from '../AnnotationToolbar';
import type { Annotation, AnnotationType } from 'shared/tabs-types';

// Store all source metas for multi-element selections
interface SourceMeta {
  id: string;
  text: string;
  startMeta: any;
  endMeta: any;
}

interface ToolbarState {
  rect: DOMRect;           // Use selection rect, not element
  sources: SourceMeta[];   // ALL sources, not just first
  combinedText: string;
}

interface AnnotatableViewerProps {
  content: string;
  annotations: Annotation[];
  onAddAnnotation: (annotation: Annotation) => void;
  onSelectAnnotation: (id: string) => void;
  onDeleteAnnotation: (id: string) => void;  // For overlap handling
  selectedAnnotationId: string | null;
}

export function AnnotatableViewer({
  content,
  annotations,
  onAddAnnotation,
  onSelectAnnotation,
  onDeleteAnnotation,
  selectedAnnotationId,
}: AnnotatableViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const highlighterRef = useRef<Highlighter | null>(null);
  const [toolbarState, setToolbarState] = useState<ToolbarState | null>(null);

  // Check for overlapping annotations
  const findOverlappingAnnotations = useCallback((newSources: SourceMeta[]) => {
    // Simple overlap check: if any source text is contained in existing annotation
    return annotations.filter(existing =>
      newSources.some(s => existing.originalText.includes(s.text) || s.text.includes(existing.originalText))
    );
  }, [annotations]);

  useEffect(() => {
    if (!containerRef.current) return;

    const highlighter = new Highlighter({
      $root: containerRef.current,
      // Disable in toolbar, buttons, and existing context menus
      exceptSelectors: [
        '.annotation-toolbar',
        'button',
        '.annotation-panel',
        '.context-menu',           // Prevent conflict with existing SelectionContextMenu
        '[data-radix-popper-content-wrapper]', // Radix popover menus
      ],
      wrapTag: 'mark',
      style: { className: 'annotation-highlight' },
    });

    highlighter.on(Highlighter.event.CREATE, ({ sources }) => {
      if (sources.length === 0) return;

      // Handle ALL sources, not just sources[0]
      const allSources: SourceMeta[] = sources.map(s => ({
        id: s.id,
        text: s.text,
        startMeta: s.startMeta,
        endMeta: s.endMeta,
      }));

      // Combine text from all sources
      const combinedText = sources.map(s => s.text).join('');

      // Use selection range for toolbar positioning (works for multi-line)
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      setToolbarState({ rect, sources: allSources, combinedText });
    });

    highlighter.on(Highlighter.event.CLICK, ({ id }) => {
      onSelectAnnotation(id);
    });

    highlighter.run();
    highlighterRef.current = highlighter;

    return () => {
      highlighter.dispose();
    };
  }, [content, onSelectAnnotation]);

  // Reposition toolbar on scroll/resize
  useEffect(() => {
    if (!toolbarState) return;

    const handleScrollOrResize = () => {
      // Close toolbar on scroll/resize - selection likely invalid
      setToolbarState(null);
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [toolbarState]);

  // Apply existing annotations on mount
  useEffect(() => {
    if (!highlighterRef.current) return;

    annotations.forEach(ann => {
      // Handle multi-source annotations
      if (ann.sourceMetas && ann.sourceMetas.length > 0) {
        ann.sourceMetas.forEach(meta => {
          highlighterRef.current?.fromStore(meta.startMeta, meta.endMeta, meta.text, ann.id);
        });
      } else if (ann.startMeta && ann.endMeta) {
        // Legacy single-source format
        highlighterRef.current?.fromStore(ann.startMeta, ann.endMeta, ann.originalText, ann.id);
      }
    });
  }, [annotations]);

  const handleAnnotate = (type: AnnotationType, text?: string) => {
    if (!toolbarState) return;

    // Check for overlaps - remove existing if user confirms
    const overlapping = findOverlappingAnnotations(toolbarState.sources);
    if (overlapping.length > 0) {
      // Option: Auto-remove overlapping annotations
      // Or: Show confirmation dialog
      overlapping.forEach(ann => {
        highlighterRef.current?.remove(ann.id);
        onDeleteAnnotation(ann.id);
      });
    }

    const annotation: Annotation = {
      id: toolbarState.sources[0].id, // Primary ID
      type,
      originalText: toolbarState.combinedText,
      newText: type === 'REPLACEMENT' ? text : undefined,
      comment: type === 'COMMENT' ? text : undefined,
      createdAt: Date.now(),
      // Store ALL source metas for multi-element selections
      sourceMetas: toolbarState.sources,
      // Legacy fields for backward compat
      startMeta: toolbarState.sources[0].startMeta,
      endMeta: toolbarState.sources[toolbarState.sources.length - 1].endMeta,
    };

    // Apply visual style based on type to ALL highlighted elements
    toolbarState.sources.forEach(source => {
      const doms = highlighterRef.current?.getDoms(source.id);
      doms?.forEach(dom => {
        dom.classList.add(`annotation-${type.toLowerCase()}`);
      });
    });

    onAddAnnotation(annotation);
    setToolbarState(null);
  };

  const handleToolbarClose = () => {
    if (toolbarState) {
      // Remove all sources
      toolbarState.sources.forEach(source => {
        highlighterRef.current?.remove(source.id);
      });
    }
    setToolbarState(null);
  };

  return (
    <div ref={containerRef} className="annotatable-viewer">
      <MarkdownRenderer content={content} />

      {toolbarState && (
        <AnnotationToolbar
          rect={toolbarState.rect}  // Pass rect instead of element
          onAnnotate={handleAnnotate}
          onClose={handleToolbarClose}
        />
      )}
    </div>
  );
}
```

### Milestone 3.4: Create AnnotationToolbar Component

**Create `apps/desktop/src/renderer/.../PlanViewerPane/AnnotationToolbar/AnnotationToolbar.tsx`:**

```typescript
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { HiTrash, HiChatBubbleLeft, HiArrowsRightLeft } from 'react-icons/hi2';
import { Button } from '@superset/ui/button';
import { Textarea } from '@superset/ui/textarea';
import type { AnnotationType } from 'shared/tabs-types';

interface AnnotationToolbarProps {
  rect: DOMRect;  // Selection range rect for positioning (works for multi-line)
  onAnnotate: (type: AnnotationType, text?: string) => void;
  onClose: () => void;
}

export function AnnotationToolbar({
  rect,      // DOMRect from selection range, not element
  onAnnotate,
  onClose,
}: AnnotationToolbarProps) {
  const [step, setStep] = useState<'menu' | 'input'>('menu');
  const [activeType, setActiveType] = useState<AnnotationType | null>(null);
  const [inputValue, setInputValue] = useState('');

  // Position below selection, clamped to viewport
  const top = Math.min(rect.bottom + 8, window.innerHeight - 200);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 300));

  const handleTypeSelect = (type: AnnotationType) => {
    if (type === 'DELETION') {
      onAnnotate(type);
    } else {
      setActiveType(type);
      setStep('input');
    }
  };

  const handleSubmit = () => {
    if (activeType && inputValue.trim()) {
      onAnnotate(activeType, inputValue.trim());
    }
  };

  return createPortal(
    <div
      className="fixed z-50 bg-popover border rounded-lg shadow-lg p-2"
      style={{ top, left }}
    >
      {step === 'menu' ? (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleTypeSelect('DELETION')}
            className="text-destructive"
          >
            <HiTrash className="size-4 mr-1" />
            Delete
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleTypeSelect('COMMENT')}
          >
            <HiChatBubbleLeft className="size-4 mr-1" />
            Comment
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleTypeSelect('REPLACEMENT')}
          >
            <HiArrowsRightLeft className="size-4 mr-1" />
            Replace
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="w-64 space-y-2">
          <Textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={activeType === 'COMMENT' ? 'Add your comment...' : 'Replace with...'}
            className="min-h-[60px]"
            autoFocus
          />
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => setStep('menu')}>
              Back
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={!inputValue.trim()}>
              Add
            </Button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
```

### Milestone 3.5: Create AnnotationPanel Component

Sidebar showing all annotations with ability to select/delete.

**Create `apps/desktop/src/renderer/.../PlanViewerPane/AnnotationPanel/AnnotationPanel.tsx`:**

```typescript
import { formatDistanceToNow } from 'date-fns';
import { HiTrash, HiChatBubbleLeft, HiArrowsRightLeft } from 'react-icons/hi2';
import type { Annotation } from 'shared/tabs-types';

interface AnnotationPanelProps {
  annotations: Annotation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

const typeConfig = {
  DELETION: { icon: HiTrash, color: 'text-destructive', label: 'Delete' },
  COMMENT: { icon: HiChatBubbleLeft, color: 'text-blue-500', label: 'Comment' },
  REPLACEMENT: { icon: HiArrowsRightLeft, color: 'text-purple-500', label: 'Replace' },
};

export function AnnotationPanel({
  annotations,
  selectedId,
  onSelect,
  onDelete,
}: AnnotationPanelProps) {
  const sorted = [...annotations].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <aside className="w-64 border-l bg-muted/30 flex flex-col">
      <div className="p-3 border-b">
        <h3 className="text-sm font-medium">
          Annotations ({annotations.length})
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2">
            Select text to add annotations
          </p>
        ) : (
          sorted.map(ann => {
            const config = typeConfig[ann.type];
            const Icon = config.icon;
            const isSelected = selectedId === ann.id;

            return (
              <div
                key={ann.id}
                className={`p-2 rounded border cursor-pointer transition-colors ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted'
                }`}
                onClick={() => onSelect(ann.id)}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1">
                    <Icon className={`size-3 ${config.color}`} />
                    <span className="text-xs font-medium">{config.label}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(ann.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded"
                  >
                    <HiTrash className="size-3 text-destructive" />
                  </button>
                </div>

                <p className="text-xs text-muted-foreground truncate">
                  "{ann.originalText}"
                </p>

                {(ann.comment || ann.newText) && (
                  <p className="text-xs mt-1 text-foreground">
                    → {ann.comment || ann.newText}
                  </p>
                )}

                <span className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(ann.createdAt, { addSuffix: true })}
                </span>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
```

### Milestone 3.6: Create Feedback Export Utility

**Create `apps/desktop/src/renderer/.../PlanViewerPane/utils/exportFeedback.ts`:**

```typescript
import type { Annotation } from 'shared/tabs-types';

/**
 * Converts annotations to structured markdown feedback.
 * Format inspired by Plannotator's exportDiff.
 */
export function exportAnnotationsToFeedback(annotations: Annotation[]): string {
  if (annotations.length === 0) {
    return '';
  }

  const sorted = [...annotations].sort((a, b) => a.createdAt - b.createdAt);

  let output = `# Plan Feedback\n\n`;
  output += `I've reviewed this plan and have ${annotations.length} piece${annotations.length > 1 ? 's' : ''} of feedback:\n\n`;

  sorted.forEach((ann, index) => {
    output += `## ${index + 1}. `;

    switch (ann.type) {
      case 'DELETION':
        output += `Remove this\n`;
        output += `\`\`\`\n${ann.originalText}\n\`\`\`\n`;
        output += `> I don't want this in the plan.\n`;
        break;

      case 'REPLACEMENT':
        output += `Change this\n`;
        output += `**From:**\n\`\`\`\n${ann.originalText}\n\`\`\`\n`;
        output += `**To:**\n\`\`\`\n${ann.newText}\n\`\`\`\n`;
        break;

      case 'COMMENT':
        output += `Feedback on: "${ann.originalText.slice(0, 50)}${ann.originalText.length > 50 ? '...' : ''}"\n`;
        output += `> ${ann.comment}\n`;
        break;
    }

    output += '\n';
  });

  return output;
}
```

### Milestone 3.7: Integrate with DecisionBar

**Update DecisionBar to auto-generate feedback from annotations:**

```typescript
const handleReject = async (manualFeedback: string) => {
  // Combine manual feedback with annotation-generated feedback
  const annotationFeedback = exportAnnotationsToFeedback(annotations);
  const combinedFeedback = annotationFeedback
    ? `${annotationFeedback}\n---\n\n## Additional Notes\n\n${manualFeedback}`
    : manualFeedback;

  onReject(combinedFeedback);
};
```

### Milestone 3.8: Add CSS for Annotation Highlights

**Add to global styles or component CSS:**

```css
.annotation-highlight {
  background-color: rgba(255, 220, 0, 0.3);
  cursor: pointer;
  transition: background-color 0.2s;
}

.annotation-highlight:hover {
  background-color: rgba(255, 220, 0, 0.5);
}

.annotation-highlight.annotation-deletion {
  background-color: rgba(239, 68, 68, 0.2);
  text-decoration: line-through;
}

.annotation-highlight.annotation-replacement {
  background-color: rgba(168, 85, 247, 0.2);
}

.annotation-highlight.annotation-comment {
  background-color: rgba(59, 130, 246, 0.2);
  border-bottom: 2px solid rgb(59, 130, 246);
}

.annotation-highlight.selected {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}
```

## New Files (Phase 3)

```
apps/desktop/src/renderer/.../PlanViewerPane/
├── AnnotatableViewer/
│   ├── AnnotatableViewer.tsx
│   └── index.ts
├── AnnotationToolbar/
│   ├── AnnotationToolbar.tsx
│   └── index.ts
├── AnnotationPanel/
│   ├── AnnotationPanel.tsx
│   └── index.ts
├── utils/
│   └── exportFeedback.ts
└── styles.css
```

## Dependencies (Phase 3)

**New dependency:**
- `web-highlighter` - DOM-based text selection and highlighting

## Updated PlanViewerPane Layout (Phase 3)

```typescript
export function PlanViewerPane({ ... }) {
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [showAnnotationPanel, setShowAnnotationPanel] = useState(true);

  return (
    <MosaicWindow ...>
      <div className="flex h-full">
        {/* Main content with annotations */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-auto p-4">
            <AnnotatableViewer
              content={planViewer.content}
              annotations={planViewer.annotations}
              onAddAnnotation={handleAddAnnotation}
              onSelectAnnotation={setSelectedAnnotationId}
              selectedAnnotationId={selectedAnnotationId}
            />
          </div>
          <DecisionBar
            annotations={planViewer.annotations}
            ...
          />
        </div>

        {/* Annotation sidebar */}
        {showAnnotationPanel && planViewer.annotations.length > 0 && (
          <AnnotationPanel
            annotations={planViewer.annotations}
            selectedId={selectedAnnotationId}
            onSelect={setSelectedAnnotationId}
            onDelete={handleDeleteAnnotation}
          />
        )}
      </div>
    </MosaicWindow>
  );
}
```

---

## Summary: Phase 2 vs Phase 3

| Aspect | Phase 2 | Phase 3 |
|--------|---------|---------|
| **Goal** | Basic approve/reject with text feedback | Rich annotation-based feedback |
| **UI** | DecisionBar with buttons + textarea | + AnnotatableViewer + Toolbar + Panel |
| **Feedback** | Manual text input | Auto-generated from annotations |
| **Dependencies** | None new | + web-highlighter |
| **Complexity** | Medium (tRPC + response files) | High (DOM manipulation + state sync) |
| **Time Estimate** | Can be done independently | Builds on Phase 2 |

## Implementation Order Recommendation

1. **Phase 2 first** - Establishes the response channel and basic workflow
2. **Phase 3 after** - Enhances feedback quality with annotations

Phase 2 is valuable standalone (users can approve/reject with manual feedback). Phase 3 adds polish but isn't required for core functionality.

---

## Gotchas and Edge Cases

This section collects implementation pitfalls identified during architectural review.

### Phase 2 Gotchas

**1. Path Traversal with Unvalidated planId**
```typescript
// ❌ DANGEROUS: planId could be "../../../etc/passwd"
const planPath = path.join(PLANS_TMP_DIR, `${planId}.md`);

// ✅ SAFE: Validate format before use
const PLAN_ID_PATTERN = /^plan-\d+-[a-z0-9]+$/;
if (!PLAN_ID_PATTERN.test(planId)) {
  throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid plan ID format' });
}
```

**2. planId/planPath Mismatch**
Attacker could submit `planId: "plan-123"` but `planPath: "/etc/passwd"`.

**Mitigation:** Validate `planId === basename(planPath).replace(".md","")` before processing.

**3. Race Window: Fast Approval Before Agent Listening**
If Superset is notified before `.waiting` file exists, a fast approval fails precondition check.

**Mitigation:** Agent MUST create `.waiting` file BEFORE notifying Superset:
```bash
# ✅ CORRECT ORDER
echo '{"token":"..."}' > "$WAITING_FILE"
curl -X POST "http://127.0.0.1:$PORT/hook/plan" ...
```

**4. Duplicate Response Writes (Race Condition)**
Two tabs submit simultaneously; `rename()` can overwrite on POSIX without error.

**Mitigation:** Use exclusive-create (`O_CREAT | O_EXCL`) instead of check-then-rename:
```typescript
// ✅ Atomic exclusive create - fails if file exists
open(responsePath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, ...)
```

**5. Stale `.waiting` Files (PID Reuse)**
Checking "is PID running" alone isn't reliable - PIDs can be reused. A stale `.waiting` from a crashed agent might have its PID reused by an unrelated process.

**Mitigation:** Include random token + createdAt in `.waiting`:
```json
{"pid": 12345, "token": "abc123", "createdAt": 1704369600000}
```
Response must include matching token. Old `.waiting` files (>24h) ignored regardless of PID.

**6. Race Condition: Multiple Tabs Respond to Same Plan**
Two browser tabs could both submit responses before either refresh sees the other's status.

**Mitigation:**
- Use exclusive-create for response file (fails if already exists)
- Return CONFLICT error to second submitter
- UI should disable buttons immediately after click (optimistic)

**7. Windows Compatibility**
The shell script uses bash-isms (`$((ELAPSED + 1))`, `[ -f ... ]`). Windows Git Bash handles most, but:
- Prefer cross-platform Node.js implementations for agent tools like OpenCode
- Test shell hooks under Git Bash on Windows before shipping
- `jq` may not be available; consider bundling or using Node for JSON

**8. Localhost CSRF**
Any website can POST to `http://127.0.0.1:PORT/hook/plan`. CORS headers don't help because simple POST requests don't trigger preflight.

**Mitigation (REQUIRED):**
- Per-install secret token in POST body, validated server-side
- Token passed to agent hooks via environment variable
- Reject requests without valid token

### Phase 3 Gotchas

**1. React + web-highlighter DOM Conflict**
`web-highlighter` mutates the DOM directly. Any React re-render will wipe annotations.

**Symptoms:** Annotations disappear when unrelated state changes.

**Solutions tested in spike:**
- Memoize `<AnnotatableViewer>` aggressively
- Use `dangerouslySetInnerHTML` with static markdown output (⚠️ MUST sanitize!)
- Or render to a detached container React doesn't manage

**2. ⚠️ CRITICAL: Sanitization in Uncontrolled Containers**
Using `innerHTML` with untrusted markdown bypasses React's XSS protection. In Electron, XSS = full system compromise.

```typescript
// ❌ DANGEROUS - XSS in Electron context
containerRef.current.innerHTML = renderMarkdownToHtml(content);

// ✅ SAFE - Reuse existing sanitize pipeline
containerRef.current.innerHTML = sanitizeHtml(renderMarkdownToHtml(content));
```

**MUST:** Reuse the same sanitize pipeline as `MarkdownRenderer`. Test with `<script>`, `onclick`, `javascript:` URIs.

**3. `fromStore()` Multi-Source Pitfall**
Selections spanning multiple DOM elements produce multiple sources. Storing only `sources[0]` loses parts of the selection.

```typescript
// ❌ May miss parts of selection
const source = sources[0];

// ✅ Handle all sources
const allSources = sources.map(s => ({
  id: s.id, text: s.text, startMeta: s.startMeta, endMeta: s.endMeta
}));
```

**4. Context-Menu Conflict**
Existing `SelectionContextMenu` may fight with `web-highlighter` for selection events.

**Mitigation:** Add `.context-menu` and `[data-radix-popper-content-wrapper]` to `exceptSelectors`, or disable SelectionContextMenu inside AnnotatableViewer.

**5. Toolbar Positioning for Multi-Line Selections**
Anchoring toolbar to a single `<mark>` element fails for selections spanning multiple lines/blocks.

**Mitigation:** Use `window.getSelection().getRangeAt(0).getBoundingClientRect()` for position. Close toolbar on scroll/resize since rect becomes stale.

**6. Export Formatting Edge Cases**
When exporting annotations to markdown feedback:

| Scenario | Problem | Fix |
|----------|---------|-----|
| Selected text contains backticks | Breaks fenced code blocks | Escape or use indented blocks |
| Selected text is ambiguous | "Change this" matches multiple places | Include line numbers or surrounding context |
| Very long selections | Feedback becomes unwieldy | Truncate with "..." after 500 chars |
| Selections inside code blocks | Formatting looks wrong | Detect and preserve code block wrapper |

**7. Annotation Persistence Across Sessions**
`web-highlighter`'s `fromStore()` relies on DOM structure. If markdown rendering changes (e.g., plugin update), stored annotations may fail to reapply.

**Mitigation:**
- Store text content alongside meta for fallback matching
- Accept that annotations are ephemeral (plan lifetime only)
- Consider logging when `fromStore()` fails for debugging

**8. Overlapping Annotations**
Users might annotate the same text twice (e.g., DELETE then COMMENT). Nested `<mark>` elements get messy.

**Decision required:** Choose one approach:
- **Replace:** New annotation removes overlapping old one (implemented in code above)
- **Merge:** Combine annotations into one with multiple types
- **Reject:** Prevent overlap with error message

### General Gotchas

**1. Agent Timeout vs. UI Timeout**
Agent hooks timeout after 30 minutes. If UI takes longer to render/respond, agent may already have timed out.

**Ensure:** UI displays "Agent no longer waiting" if `.waiting` file is absent.

**2. Cleanup Timing**
24-hour cleanup is generous but may leave many orphaned files during active development.

**Consider:** Cleanup on app quit + 24h background sweep.

**3. Multiple Concurrent Plans**
User might have multiple plan review panes open. Ensure each pane tracks its own `planId` and doesn't mix responses.

**Test case:** Open 3 plans → approve middle one → verify correct plan gets response.

---

## References

- [Plannotator](https://github.com/backnotprop/plannotator) - Original implementation reference
- [web-highlighter](https://github.com/nicokempe/web-highlighter) - DOM selection library
- [Claude Code Hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) - Agent hook system

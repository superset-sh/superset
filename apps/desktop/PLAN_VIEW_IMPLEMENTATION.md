# Plan View Implementation Plan

## Overview
Add a "Plan" view to the desktop app sidebar that enables orchestrated task execution with Claude API (headless), kanban-style status tracking, and an AI-powered orchestration chat using Vercel AI SDK.

## Key User Requirements
- **Claude Mode**: Headless API execution with optional terminal attachment
- **Linear Import**: Both manual selection AND bulk filter by project/team
- **Concurrency**: No hard limit (start with 10+, eventually payment tiers for hundreds)
- **Chat Powers**: Read codebase + Task management + Memory sharing between agents

---

## Progress Tracking

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | DONE | UI Foundation & Navigation |
| Phase 2 | DONE | Database Schema |
| Phase 3 | DONE | tRPC Router Structure |
| Phase 4 | DONE | Kanban Board UI (basic drag-drop) |
| Phase 5 | DONE | Task Execution Engine |
| Phase 6 | IN PROGRESS | Orchestration Chat |
| Phase 7 | Pending | Linear Integration |
| Phase 8 | Pending | Terminal Attachment |
| Phase 9 | Pending | Memory Sharing |
| Phase 10 | Pending | Polish & Edge Cases |

---

## Phase 1: UI Foundation & Navigation - DONE

### 1.1 Add "plan" to AppView type - DONE
**File**: `apps/desktop/src/renderer/stores/app-state.ts`

### 1.2 Add Plan button to sidebar - DONE
**File**: `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebarHeader/WorkspaceSidebarHeader.tsx`

### 1.3 Create PlanView component structure - DONE
**Directory**: `apps/desktop/src/renderer/screens/main/components/PlanView/`

### 1.4 Add PlanView to renderContent() - DONE
**File**: `apps/desktop/src/renderer/screens/main/index.tsx`

---

## Phase 2: Database Schema - DONE

### 2.1 Create plan tables - DONE
**File**: `packages/local-db/src/schema/schema.ts`

Added tables:
- `plans` - Plan configurations
- `planTasks` - Individual tasks within a plan
- `executionLogs` - Streaming output from task execution
- `agentMemory` - Shared context between agents
- `orchestrationMessages` - Chat history for orchestration

### 2.2 Add relations - DONE
**File**: `packages/local-db/src/schema/relations.ts`

---

## Phase 3: tRPC Router Structure - DONE

### 3.1 Create plan router - DONE
**Directory**: `apps/desktop/src/lib/trpc/routers/plan/`

Created:
- `index.ts` - Router exports
- `plan.ts` - Merges all procedures
- `procedures/crud.ts` - Plan CRUD (create, get, getAll, getByProject, getActiveByProject, update, delete)
- `procedures/tasks.ts` - Task CRUD, move, reorder, bulk create
- `procedures/execution.ts` - Execution control (start, stop, pause, resume, subscriptions)

### 3.2 Execution procedures - DONE
Execution control is now part of the plan router.

---

## Phase 4: Kanban Board UI - DONE

Created functional kanban board with:
- Drag-and-drop between columns using HTML5 drag API
- 5 columns: Backlog, Queued, Running, Completed, Failed
- Task cards with priority indicators, descriptions, external links
- Create task dialog with title, description, priority
- Delete task functionality
- Start/stop buttons for task execution

---

## Phase 5: Task Execution Engine - DONE

### 5.1 Task Execution Manager - DONE
**File**: `apps/desktop/src/main/lib/task-execution/manager.ts`

Singleton pattern (like `WorkspaceInitManager`):
- Track all running/queued tasks with Map
- Emit progress events via EventEmitter
- Handle concurrency limits (configurable, default 10)
- Per-project locking for git operations
- Queue system for pending tasks
- AbortController for cancellation support

### 5.2 Task Executor - DONE
**File**: `apps/desktop/src/main/lib/task-execution/executor.ts`

Handles task execution:
- Creates worktree for each task with generated branch name
- Runs Claude CLI in worktree directory
- Streams output via EventEmitter
- Updates task status in database
- Cleanup on failure/cancellation

### 5.3 Worktree Auto-Creation - DONE
When task starts:
1. Generate branch name from task title (`plan/<title-slug>-<suffix>`)
2. Create worktree using existing git utilities
3. Create worktree and workspace records in DB
4. Store worktreeId and workspaceId on planTask
5. Execute Claude in worktree directory

### 5.4 tRPC Execution Procedures - DONE
**File**: `apps/desktop/src/lib/trpc/routers/plan/procedures/execution.ts`

- `start` - Start executing a task
- `stop` - Stop a running task
- `pause`/`resume` - Pause/resume execution
- `getStatus` - Get task execution status
- `getAllRunning` - Get all running tasks
- `getStats` - Get execution statistics
- `setMaxConcurrent` - Configure concurrency limit
- `subscribeProgress` - Subscribe to progress updates
- `subscribeOutput` - Subscribe to task output
- `subscribeAllOutput` - Subscribe to all task output

### 5.5 UI Integration - DONE
**File**: `apps/desktop/src/renderer/screens/main/components/PlanView/PlanView.tsx`

- Start button on backlog/failed tasks
- Stop button on running/queued tasks
- Loading indicator for running tasks
- Execution status display on task cards

---

## Phase 6: Orchestration Chat - IN PROGRESS

### 6.1 Chat Engine
**New file**: `apps/desktop/src/main/lib/orchestration/engine.ts`

Using Vercel AI SDK:
- Stream responses using `streamText` or `generateText`
- Define orchestration tools:
  - `createTask`: Create new plan task
  - `modifyTask`: Update task details
  - `startTask`: Begin task execution
  - `stopTask`: Stop running task
  - `readFile`: Read codebase files
  - `searchCode`: Search codebase
  - `getTaskStatus`: Check task execution status
  - `getTaskOutput`: Get task execution logs

### 6.2 Memory/Context Broker
**New file**: `apps/desktop/src/main/lib/orchestration/context-broker.ts`

### 6.3 Chat UI Component
**File**: `apps/desktop/src/renderer/screens/main/components/PlanView/components/OrchestrationChat/`

---

## Phase 7: Linear Integration - Pending

### 7.1 Manual Selection Import
- Fetch user's Linear issues via existing integration
- Display in modal with checkboxes
- Import selected issues as plan tasks

### 7.2 Bulk Filter Import
- Filter by Linear project, team, or label
- Import all matching issues

### 7.3 Status Sync Back
- When task completes, optionally update Linear issue status

---

## Phase 8: Terminal Attachment - Pending

### 8.1 Terminal Bridge
**New file**: `apps/desktop/src/main/lib/task-execution/terminal-bridge.ts`

- Each task has a headless terminal buffer
- Write Claude output to buffer
- On "attach": connect UI pane to buffer, return scrollback
- Support interactive mode (send input to Claude)

---

## Phase 9: Memory Sharing - Pending

### 9.1 Context Broker
- Store project context in agent_memory table
- Share context between orchestrator and task agents
- Key contexts:
  - `codebase_summary`: Auto-generated project overview
  - `recent_changes`: Files modified by completed tasks
  - `task_decisions`: Key decisions made during execution
  - `blockers`: Issues encountered

---

## Phase 10: Polish & Edge Cases - Pending

- [ ] Error recovery for failed tasks
- [ ] Retry failed tasks with updated context
- [ ] Pause/resume plan execution
- [ ] Plan templates (save/load task sets)
- [ ] Keyboard shortcuts for common actions
- [ ] Bulk task actions (start all, stop all)
- [ ] Export execution logs

---

## Critical Files Summary

| Purpose | File Path |
|---------|-----------|
| App state (add "plan" view) | `apps/desktop/src/renderer/stores/app-state.ts` |
| Sidebar header (add Plan button) | `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebarHeader/WorkspaceSidebarHeader.tsx` |
| Main screen (add PlanView render) | `apps/desktop/src/renderer/screens/main/index.tsx` |
| Local DB schema | `packages/local-db/src/schema/schema.ts` |
| Worktree init patterns | `apps/desktop/src/main/lib/workspace-init-manager.ts` |
| Terminal manager patterns | `apps/desktop/src/main/lib/terminal/manager.ts` |
| AI UI components | `packages/ui/src/components/ai-elements/` |
| Existing Linear integration | `packages/trpc/src/router/integration/linear/` |
| tRPC subscription patterns | `apps/desktop/src/lib/trpc/routers/workspaces/procedures/init.ts` |

---

## Technical Notes

- **tRPC subscriptions**: Use `observable` pattern (not async generators) per trpc-electron requirements
- **IPC**: Use tRPC for all main/renderer communication (per AGENTS.md)
- **State**: Use Zustand for local UI state
- **No Node.js in renderer**: All file/git operations via tRPC to main process
- **Vercel AI SDK**: Already installed (`ai@^5.0.112` in packages/ui)

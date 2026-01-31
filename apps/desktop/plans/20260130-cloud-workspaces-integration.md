# Cloud Workspaces Integration Plan

**Date:** 2026-01-30
**Status:** Planning
**Based on:** [background-agents](https://github.com/ColeMurray/background-agents) + Ramp Inspect architecture

## Overview

Integrate cloud workspaces into Superset Desktop so users can:
1. See cloud workspaces alongside local workspaces in the sidebar
2. Click a cloud workspace to open an embedded web view
3. Create cloud sessions from Linear issues or directly
4. Hand off between cloud and local seamlessly

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          DESKTOP APP                                     │
│  ┌──────────────────┐         ┌─────────────────────────────────────┐  │
│  │  WorkspaceSidebar │         │  Content Area                       │  │
│  │  ├─ Local Project │         │  ├─ Local: Terminal + Files         │  │
│  │  │   └─ branches  │         │  └─ Cloud: WebView → web.superset   │  │
│  │  └─ ☁️ Cloud      │         └─────────────────────────────────────┘  │
│  │      └─ sessions  │                                                  │
│  └──────────────────┘                                                   │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ WebSocket
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  CONTROL PLANE (Cloudflare Workers + Durable Objects)                     │
│  Per-session DO: SQLite state, WebSocket hub, sandbox lifecycle           │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │ WebSocket
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  DATA PLANE (Modal Sandboxes)                                             │
│  Per-session sandbox: Claude Code agent, git workspace, bridge → DO       │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Database & API Foundation

**Goal:** Cloud workspace records exist and sync to desktop via ElectricSQL

### Milestones

- [ ] **M1.1** Create `cloud_workspaces` table schema in `packages/db`
- [ ] **M1.2** Add tRPC router for cloud workspaces in `packages/trpc`
- [ ] **M1.3** Configure ElectricSQL shape for cloud workspaces sync
- [ ] **M1.4** Create seed data for testing

### Schema

```typescript
// packages/db/src/schema/cloud-workspaces.ts
export const cloudWorkspaces = pgTable("cloud_workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  userId: text("user_id").notNull().references(() => users.id),

  // Session identity (maps to Durable Object name)
  sessionId: text("session_id").notNull().unique(),
  title: text("title").notNull(),

  // Repository info
  repoOwner: text("repo_owner").notNull(),
  repoName: text("repo_name").notNull(),
  branch: text("branch").notNull(),
  baseBranch: text("base_branch").notNull().default("main"),

  // Status
  status: text("status", {
    enum: ["created", "active", "completed", "archived"]
  }).notNull().default("created"),
  sandboxStatus: text("sandbox_status", {
    enum: ["pending", "warming", "syncing", "ready", "running", "stopped", "failed"]
  }).default("pending"),

  // External links
  linearIssueId: text("linear_issue_id"),
  prUrl: text("pr_url"),
  prNumber: integer("pr_number"),

  // Model config
  model: text("model").default("claude-sonnet-4"),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastActivityAt: timestamp("last_activity_at"),
});

// Index for efficient queries
export const cloudWorkspacesOrgIdx = index("cloud_workspaces_org_idx")
  .on(cloudWorkspaces.organizationId);
```

### tRPC Router

```typescript
// packages/trpc/src/routers/cloud-workspace.ts
export const cloudWorkspaceRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.cloudWorkspaces.findMany({
      where: eq(cloudWorkspaces.organizationId, ctx.session.activeOrganizationId),
      orderBy: desc(cloudWorkspaces.updatedAt),
    });
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.cloudWorkspaces.findFirst({
        where: and(
          eq(cloudWorkspaces.id, input.id),
          eq(cloudWorkspaces.organizationId, ctx.session.activeOrganizationId),
        ),
      });
    }),

  create: protectedProcedure
    .input(z.object({
      title: z.string(),
      repoOwner: z.string(),
      repoName: z.string(),
      branch: z.string().optional(),
      baseBranch: z.string().default("main"),
      linearIssueId: z.string().optional(),
      initialPrompt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sessionId = crypto.randomUUID();
      const branch = input.branch ?? `superset/${sessionId.slice(0, 8)}`;

      const [workspace] = await ctx.db.insert(cloudWorkspaces).values({
        organizationId: ctx.session.activeOrganizationId,
        userId: ctx.session.userId,
        sessionId,
        title: input.title,
        repoOwner: input.repoOwner,
        repoName: input.repoName,
        branch,
        baseBranch: input.baseBranch,
        linearIssueId: input.linearIssueId,
      }).returning();

      // TODO: Call control plane to initialize session
      // await initializeCloudSession(workspace, input.initialPrompt);

      return workspace;
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(cloudWorkspaces)
        .set({ status: "archived", updatedAt: new Date() })
        .where(and(
          eq(cloudWorkspaces.id, input.id),
          eq(cloudWorkspaces.organizationId, ctx.session.activeOrganizationId),
        ));
    }),
});
```

### Tests

```typescript
// packages/trpc/src/routers/cloud-workspace.test.ts
describe("cloudWorkspaceRouter", () => {
  describe("list", () => {
    it("returns only workspaces for current organization", async () => {
      // Setup: create workspaces in different orgs
      // Assert: only returns workspaces matching activeOrganizationId
    });

    it("orders by updatedAt descending", async () => {
      // Setup: create workspaces with different timestamps
      // Assert: most recent first
    });
  });

  describe("create", () => {
    it("generates sessionId and branch if not provided", async () => {
      const result = await caller.cloudWorkspace.create({
        title: "Test Session",
        repoOwner: "superset",
        repoName: "superset",
      });

      expect(result.sessionId).toMatch(/^[a-f0-9-]{36}$/);
      expect(result.branch).toMatch(/^superset\/[a-f0-9]{8}$/);
    });

    it("uses provided branch name", async () => {
      const result = await caller.cloudWorkspace.create({
        title: "Test Session",
        repoOwner: "superset",
        repoName: "superset",
        branch: "feat/my-feature",
      });

      expect(result.branch).toBe("feat/my-feature");
    });

    it("links Linear issue when provided", async () => {
      const result = await caller.cloudWorkspace.create({
        title: "Test Session",
        repoOwner: "superset",
        repoName: "superset",
        linearIssueId: "LIN-123",
      });

      expect(result.linearIssueId).toBe("LIN-123");
    });
  });

  describe("archive", () => {
    it("sets status to archived", async () => {
      // Setup: create a workspace
      // Action: archive it
      // Assert: status is "archived"
    });

    it("fails for workspace in different org", async () => {
      // Setup: create workspace in org A, switch to org B
      // Assert: throws FORBIDDEN
    });
  });
});
```

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/schema/cloud-workspaces.ts` | Create | Schema definition |
| `packages/db/src/schema/index.ts` | Modify | Export new schema |
| `packages/trpc/src/routers/cloud-workspace.ts` | Create | tRPC router |
| `packages/trpc/src/routers/cloud-workspace.test.ts` | Create | Tests |
| `packages/trpc/src/root.ts` | Modify | Add router to appRouter |
| `apps/api/src/lib/electric/shapes.ts` | Modify | Add ElectricSQL shape |

### Acceptance Criteria

- [ ] Can create cloud workspace via tRPC mutation
- [ ] Cloud workspaces sync to desktop SQLite via ElectricSQL
- [ ] `bun test` passes for cloud-workspace router
- [ ] Can query cloud workspaces filtered by organization

---

## Phase 2: Desktop Sidebar Integration

**Goal:** Cloud workspaces appear in sidebar and can be selected

### Milestones

- [ ] **M2.1** Create CloudSection component for sidebar
- [ ] **M2.2** Add cloud workspace list item with status indicators
- [ ] **M2.3** Wire up navigation to cloud workspaces
- [ ] **M2.4** Add "New Cloud Workspace" button/modal

### Components

```
WorkspaceSidebar/
├── CloudSection/
│   ├── CloudSection.tsx           # Section container
│   ├── CloudWorkspaceListItem.tsx # Individual workspace row
│   ├── NewCloudWorkspaceButton.tsx
│   └── index.ts
```

### CloudSection Component

```typescript
// src/renderer/screens/main/components/WorkspaceSidebar/CloudSection/CloudSection.tsx
import { Cloud, Plus } from "lucide-react";
import { trpc } from "renderer/lib/trpc";
import { CloudWorkspaceListItem } from "./CloudWorkspaceListItem";
import { NewCloudWorkspaceButton } from "./NewCloudWorkspaceButton";

interface CloudSectionProps {
  isCollapsed: boolean;
}

export function CloudSection({ isCollapsed }: CloudSectionProps) {
  const { data: cloudWorkspaces, isLoading } = trpc.cloudWorkspace.list.useQuery();

  const activeWorkspaces = cloudWorkspaces?.filter(w => w.status !== "archived") ?? [];

  if (isLoading) {
    return <CloudSectionSkeleton isCollapsed={isCollapsed} />;
  }

  return (
    <div className="border-t border-border/50 mt-2 pt-2">
      {/* Section Header */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Cloud className="h-4 w-4" />
          {!isCollapsed && <span className="text-xs font-medium">Cloud</span>}
        </div>
        {!isCollapsed && <NewCloudWorkspaceButton />}
      </div>

      {/* Workspace List */}
      {activeWorkspaces.length > 0 ? (
        <div className="space-y-0.5 px-1">
          {activeWorkspaces.map((workspace) => (
            <CloudWorkspaceListItem
              key={workspace.id}
              workspace={workspace}
              isCollapsed={isCollapsed}
            />
          ))}
        </div>
      ) : (
        !isCollapsed && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            No cloud workspaces
          </div>
        )
      )}
    </div>
  );
}
```

### CloudWorkspaceListItem Component

```typescript
// src/renderer/screens/main/components/WorkspaceSidebar/CloudSection/CloudWorkspaceListItem.tsx
import { useNavigate, useParams } from "@tanstack/react-router";
import { Cloud, GitBranch, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@superset/ui/lib/utils";
import type { CloudWorkspace } from "@superset/db/schema";

interface CloudWorkspaceListItemProps {
  workspace: CloudWorkspace;
  isCollapsed: boolean;
}

const statusIcons = {
  pending: Loader2,
  warming: Loader2,
  syncing: Loader2,
  ready: Cloud,
  running: Loader2,
  stopped: Cloud,
  failed: AlertCircle,
} as const;

const statusColors = {
  pending: "text-muted-foreground",
  warming: "text-yellow-500 animate-spin",
  syncing: "text-blue-500 animate-spin",
  ready: "text-green-500",
  running: "text-blue-500 animate-pulse",
  stopped: "text-muted-foreground",
  failed: "text-red-500",
} as const;

export function CloudWorkspaceListItem({
  workspace,
  isCollapsed
}: CloudWorkspaceListItemProps) {
  const navigate = useNavigate();
  const { workspaceId } = useParams({ strict: false });
  const isActive = workspaceId === `cloud:${workspace.sessionId}`;

  const StatusIcon = statusIcons[workspace.sandboxStatus ?? "pending"];
  const statusColor = statusColors[workspace.sandboxStatus ?? "pending"];

  const handleClick = () => {
    navigate({
      to: "/workspace/$workspaceId",
      params: { workspaceId: `cloud:${workspace.sessionId}` }
    });
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left",
        "hover:bg-accent transition-colors",
        isActive && "bg-accent"
      )}
    >
      <StatusIcon className={cn("h-4 w-4 shrink-0", statusColor)} />

      {!isCollapsed && (
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-medium">
            {workspace.title}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <GitBranch className="h-3 w-3" />
            <span className="truncate">{workspace.branch}</span>
          </div>
        </div>
      )}

      {!isCollapsed && workspace.prUrl && (
        <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
      )}
    </button>
  );
}
```

### Update WorkspaceSidebar

```typescript
// src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebar.tsx
import { CloudSection } from "./CloudSection";

export function WorkspaceSidebar({ isCollapsed = false }: WorkspaceSidebarProps) {
  const { groups } = useWorkspaceShortcuts();
  // ... existing code ...

  return (
    <SidebarDropZone className="flex flex-col h-full bg-background">
      <WorkspaceSidebarHeader isCollapsed={isCollapsed} />

      <div className="flex-1 overflow-y-auto hide-scrollbar">
        {/* Local projects */}
        {groups.map((group, index) => (
          <ProjectSection
            key={group.project.id}
            // ... existing props ...
          />
        ))}

        {/* Cloud workspaces section */}
        <CloudSection isCollapsed={isCollapsed} />

        {groups.length === 0 && !isCollapsed && (
          // ... existing empty state ...
        )}
      </div>

      {!isCollapsed && <PortsList />}
      <WorkspaceSidebarFooter isCollapsed={isCollapsed} />
    </SidebarDropZone>
  );
}
```

### Tests

```typescript
// src/renderer/screens/main/components/WorkspaceSidebar/CloudSection/CloudSection.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CloudSection } from "./CloudSection";

describe("CloudSection", () => {
  it("renders cloud workspaces from query", async () => {
    // Mock trpc.cloudWorkspace.list to return test data
    render(<CloudSection isCollapsed={false} />);

    expect(await screen.findByText("Test Session")).toBeInTheDocument();
  });

  it("shows loading skeleton while fetching", () => {
    // Mock loading state
    render(<CloudSection isCollapsed={false} />);

    expect(screen.getByTestId("cloud-section-skeleton")).toBeInTheDocument();
  });

  it("shows empty state when no workspaces", async () => {
    // Mock empty response
    render(<CloudSection isCollapsed={false} />);

    expect(await screen.findByText("No cloud workspaces")).toBeInTheDocument();
  });

  it("hides text when collapsed", () => {
    render(<CloudSection isCollapsed={true} />);

    expect(screen.queryByText("Cloud")).not.toBeInTheDocument();
  });

  it("navigates to cloud workspace on click", async () => {
    const user = userEvent.setup();
    const mockNavigate = vi.fn();

    render(<CloudSection isCollapsed={false} />);

    await user.click(await screen.findByText("Test Session"));

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/workspace/$workspaceId",
      params: { workspaceId: "cloud:test-session-id" }
    });
  });
});

// src/renderer/screens/main/components/WorkspaceSidebar/CloudSection/CloudWorkspaceListItem.test.tsx
describe("CloudWorkspaceListItem", () => {
  it("shows correct status icon for each sandbox status", () => {
    const statuses = ["pending", "warming", "syncing", "ready", "running", "stopped", "failed"];

    for (const status of statuses) {
      const { container } = render(
        <CloudWorkspaceListItem
          workspace={{ ...mockWorkspace, sandboxStatus: status }}
          isCollapsed={false}
        />
      );

      // Assert correct icon is rendered
      expect(container.querySelector(`[data-status="${status}"]`)).toBeInTheDocument();
    }
  });

  it("shows PR indicator when prUrl exists", () => {
    render(
      <CloudWorkspaceListItem
        workspace={{ ...mockWorkspace, prUrl: "https://github.com/..." }}
        isCollapsed={false}
      />
    );

    expect(screen.getByTestId("pr-indicator")).toBeInTheDocument();
  });

  it("highlights when active", () => {
    // Mock useParams to return matching workspaceId
    render(
      <CloudWorkspaceListItem
        workspace={mockWorkspace}
        isCollapsed={false}
      />
    );

    expect(screen.getByRole("button")).toHaveClass("bg-accent");
  });
});
```

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/desktop/src/renderer/.../CloudSection/CloudSection.tsx` | Create | Section container |
| `apps/desktop/src/renderer/.../CloudSection/CloudWorkspaceListItem.tsx` | Create | List item |
| `apps/desktop/src/renderer/.../CloudSection/NewCloudWorkspaceButton.tsx` | Create | Create button |
| `apps/desktop/src/renderer/.../CloudSection/index.ts` | Create | Barrel export |
| `apps/desktop/src/renderer/.../CloudSection/*.test.tsx` | Create | Tests |
| `apps/desktop/src/renderer/.../WorkspaceSidebar.tsx` | Modify | Add CloudSection |

### Acceptance Criteria

- [ ] Cloud section appears in sidebar below local projects
- [ ] Cloud workspaces show title, branch, and status
- [ ] Status icons animate appropriately (spinning for loading states)
- [ ] Clicking workspace navigates to `/workspace/cloud:<sessionId>`
- [ ] Section collapses properly when sidebar is collapsed
- [ ] All tests pass

---

## Phase 3: Cloud Workspace View (WebView)

**Goal:** Selecting a cloud workspace shows embedded web view

### Milestones

- [ ] **M3.1** Create CloudWorkspaceView component with Electron webview
- [ ] **M3.2** Update workspace page routing to detect cloud workspaces
- [ ] **M3.3** Handle webview lifecycle (loading, errors, navigation)
- [ ] **M3.4** Add toolbar with external link and refresh buttons

### CloudWorkspaceView Component

```typescript
// src/renderer/components/CloudWorkspaceView/CloudWorkspaceView.tsx
import { useRef, useState, useEffect } from "react";
import { Cloud, ExternalLink, RefreshCw, Maximize2 } from "lucide-react";
import { Button } from "@superset/ui/components/button";
import { Skeleton } from "@superset/ui/components/skeleton";
import { shell } from "electron";
import { trpc } from "renderer/lib/trpc";

interface CloudWorkspaceViewProps {
  sessionId: string;
}

export function CloudWorkspaceView({ sessionId }: CloudWorkspaceViewProps) {
  const webviewRef = useRef<Electron.WebviewTag>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { data: workspace } = trpc.cloudWorkspace.getBySessionId.useQuery({
    sessionId
  });

  const cloudUrl = `${import.meta.env.VITE_WEB_URL}/session/${sessionId}`;

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleLoadStart = () => {
      setIsLoading(true);
      setError(null);
    };

    const handleLoadStop = () => {
      setIsLoading(false);
    };

    const handleError = (event: Electron.DidFailLoadEvent) => {
      setIsLoading(false);
      setError(`Failed to load: ${event.errorDescription}`);
    };

    webview.addEventListener("did-start-loading", handleLoadStart);
    webview.addEventListener("did-stop-loading", handleLoadStop);
    webview.addEventListener("did-fail-load", handleError);

    return () => {
      webview.removeEventListener("did-start-loading", handleLoadStart);
      webview.removeEventListener("did-stop-loading", handleLoadStop);
      webview.removeEventListener("did-fail-load", handleError);
    };
  }, []);

  const handleRefresh = () => {
    webviewRef.current?.reload();
  };

  const handleOpenExternal = () => {
    shell.openExternal(cloudUrl);
  };

  const handlePopOut = () => {
    // Open in new Electron window
    window.ipcRenderer.invoke("window:open-cloud-session", {
      sessionId,
      title: workspace?.title
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-blue-500" />
          <span className="font-medium text-sm">
            {workspace?.title ?? "Cloud Workspace"}
          </span>
          {workspace?.branch && (
            <span className="text-xs text-muted-foreground">
              ({workspace.branch})
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>
          <Button variant="ghost" size="icon" onClick={handlePopOut}>
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleOpenExternal}>
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* WebView */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Loading cloud workspace...
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-2 text-center max-w-md">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <span className="text-sm text-muted-foreground">{error}</span>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                Try Again
              </Button>
            </div>
          </div>
        )}

        <webview
          ref={webviewRef}
          src={cloudUrl}
          className="w-full h-full"
          partition="persist:superset-cloud"
          allowpopups
        />
      </div>
    </div>
  );
}
```

### Update Workspace Page Routing

```typescript
// src/renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/page.tsx
import { CloudWorkspaceView } from "renderer/components/CloudWorkspaceView";

export function WorkspacePage() {
  const { workspaceId } = useParams({ from: "/_authenticated/_dashboard/workspace/$workspaceId" });

  // Check if this is a cloud workspace
  if (workspaceId.startsWith("cloud:")) {
    const sessionId = workspaceId.replace("cloud:", "");
    return <CloudWorkspaceView sessionId={sessionId} />;
  }

  // Local workspace - existing behavior
  return <LocalWorkspaceContent workspaceId={workspaceId} />;
}
```

### Tests

```typescript
// src/renderer/components/CloudWorkspaceView/CloudWorkspaceView.test.tsx
describe("CloudWorkspaceView", () => {
  it("renders webview with correct URL", () => {
    render(<CloudWorkspaceView sessionId="test-session" />);

    const webview = screen.getByRole("webview");
    expect(webview).toHaveAttribute("src", expect.stringContaining("/session/test-session"));
  });

  it("shows loading state initially", () => {
    render(<CloudWorkspaceView sessionId="test-session" />);

    expect(screen.getByText("Loading cloud workspace...")).toBeInTheDocument();
  });

  it("shows error state on load failure", async () => {
    render(<CloudWorkspaceView sessionId="test-session" />);

    // Simulate load error
    const webview = screen.getByRole("webview");
    fireEvent(webview, new Event("did-fail-load", {
      errorDescription: "Network error"
    }));

    expect(await screen.findByText(/Failed to load/)).toBeInTheDocument();
  });

  it("calls shell.openExternal when external link clicked", async () => {
    const user = userEvent.setup();
    const mockOpenExternal = vi.fn();
    vi.mocked(shell.openExternal).mockImplementation(mockOpenExternal);

    render(<CloudWorkspaceView sessionId="test-session" />);

    await user.click(screen.getByRole("button", { name: /external/i }));

    expect(mockOpenExternal).toHaveBeenCalledWith(
      expect.stringContaining("/session/test-session")
    );
  });

  it("reloads webview on refresh click", async () => {
    const user = userEvent.setup();
    render(<CloudWorkspaceView sessionId="test-session" />);

    const webview = screen.getByRole("webview");
    const reloadSpy = vi.spyOn(webview, "reload");

    await user.click(screen.getByRole("button", { name: /refresh/i }));

    expect(reloadSpy).toHaveBeenCalled();
  });
});

// src/renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/page.test.tsx
describe("WorkspacePage routing", () => {
  it("renders CloudWorkspaceView for cloud: prefix", () => {
    // Mock useParams to return cloud:session-123
    render(<WorkspacePage />);

    expect(screen.getByTestId("cloud-workspace-view")).toBeInTheDocument();
  });

  it("renders LocalWorkspaceContent for regular workspaceId", () => {
    // Mock useParams to return regular UUID
    render(<WorkspacePage />);

    expect(screen.getByTestId("local-workspace-content")).toBeInTheDocument();
  });
});
```

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/desktop/src/renderer/components/CloudWorkspaceView/CloudWorkspaceView.tsx` | Create | Main component |
| `apps/desktop/src/renderer/components/CloudWorkspaceView/index.ts` | Create | Barrel export |
| `apps/desktop/src/renderer/components/CloudWorkspaceView/*.test.tsx` | Create | Tests |
| `apps/desktop/src/renderer/routes/.../workspace/$workspaceId/page.tsx` | Modify | Add routing |

### Acceptance Criteria

- [ ] Cloud workspaces render embedded webview
- [ ] Loading state shows while webview loads
- [ ] Error state shows with retry button on failure
- [ ] Refresh button reloads webview
- [ ] External link opens in system browser
- [ ] Pop-out button opens new Electron window
- [ ] All tests pass

---

## Phase 4: Control Plane (Cloudflare Workers + Durable Objects)

**Goal:** Session state management and real-time WebSocket hub

### Milestones

- [ ] **M4.1** Create control-plane package with Wrangler config
- [ ] **M4.2** Implement Session Durable Object with SQLite schema
- [ ] **M4.3** Add WebSocket handling with hibernation support
- [ ] **M4.4** Create HTTP API routes for session management
- [ ] **M4.5** Add Modal sandbox client for spawning/management

### Package Structure

```
packages/control-plane/
├── src/
│   ├── index.ts                    # Worker entry point
│   ├── router.ts                   # Hono router
│   ├── session/
│   │   ├── durable-object.ts       # Session DO class
│   │   ├── schema.ts               # SQLite schema
│   │   ├── repository.ts           # DB operations
│   │   ├── websocket-handler.ts    # WebSocket logic
│   │   └── types.ts
│   ├── sandbox/
│   │   ├── modal-client.ts         # Modal API client
│   │   ├── lifecycle-manager.ts    # Spawn/snapshot/restore
│   │   └── types.ts
│   └── auth/
│       └── middleware.ts           # Auth validation
├── wrangler.toml
├── package.json
└── tsconfig.json
```

### Session Durable Object

```typescript
// packages/control-plane/src/session/durable-object.ts
import { DurableObject } from "cloudflare:workers";
import { initSchema } from "./schema";
import { SessionRepository } from "./repository";
import { WebSocketHandler } from "./websocket-handler";
import { SandboxLifecycleManager } from "../sandbox/lifecycle-manager";

export class SessionDO extends DurableObject<Env> {
  private repo: SessionRepository;
  private wsHandler: WebSocketHandler;
  private lifecycleManager: SandboxLifecycleManager;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);

    // Initialize SQLite schema
    initSchema(state.storage.sql);

    this.repo = new SessionRepository(state.storage.sql);
    this.wsHandler = new WebSocketHandler(state, this.repo);
    this.lifecycleManager = new SandboxLifecycleManager(state, env, this.repo);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      return this.wsHandler.handleUpgrade(request);
    }

    // Sandbox WebSocket (from Modal)
    if (url.pathname === "/sandbox/ws") {
      return this.wsHandler.handleSandboxConnection(request);
    }

    // HTTP API
    switch (`${request.method} ${url.pathname}`) {
      case "GET /state":
        return Response.json(await this.repo.getSessionState());

      case "POST /prompt":
        const { content, author, model } = await request.json();
        const messageId = await this.repo.queueMessage({ content, author, model });
        await this.lifecycleManager.ensureSandboxReady();
        this.wsHandler.broadcastToSandbox({ type: "prompt", messageId, content, author, model });
        return Response.json({ messageId });

      case "POST /stop":
        this.wsHandler.broadcastToSandbox({ type: "stop" });
        return Response.json({ ok: true });

      case "GET /events":
        const { after, limit } = Object.fromEntries(url.searchParams);
        return Response.json(await this.repo.getEvents({ after, limit: Number(limit) || 100 }));

      case "POST /snapshot":
        await this.lifecycleManager.createSnapshot();
        return Response.json({ ok: true });

      default:
        return new Response("Not Found", { status: 404 });
    }
  }

  // WebSocket hibernation callbacks
  async webSocketMessage(ws: WebSocket, message: string) {
    await this.wsHandler.handleMessage(ws, message);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    await this.wsHandler.handleClose(ws, code, reason);
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    await this.wsHandler.handleError(ws, error);
  }
}
```

### SQLite Schema

```typescript
// packages/control-plane/src/session/schema.ts
export function initSchema(sql: SqlStorage) {
  sql.exec(`
    -- Session metadata
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      repo_owner TEXT NOT NULL,
      repo_name TEXT NOT NULL,
      branch TEXT NOT NULL,
      base_branch TEXT NOT NULL DEFAULT 'main',
      model TEXT DEFAULT 'claude-sonnet-4',
      status TEXT DEFAULT 'created',
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    -- Message queue
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      author_name TEXT,
      author_email TEXT,
      content TEXT NOT NULL,
      model TEXT,
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      started_at INTEGER,
      completed_at INTEGER
    );

    -- Event log
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      data TEXT NOT NULL,
      message_id TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS events_message_idx ON events(message_id);
    CREATE INDEX IF NOT EXISTS events_created_idx ON events(created_at);

    -- Participants (multiplayer)
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      github_login TEXT,
      github_name TEXT,
      github_email TEXT,
      role TEXT DEFAULT 'member',
      ws_auth_token_hash TEXT,
      joined_at INTEGER DEFAULT (unixepoch())
    );

    -- Sandbox state
    CREATE TABLE IF NOT EXISTS sandbox (
      id TEXT PRIMARY KEY DEFAULT 'main',
      modal_sandbox_id TEXT,
      modal_object_id TEXT,
      snapshot_image_id TEXT,
      auth_token TEXT,
      status TEXT DEFAULT 'pending',
      last_heartbeat INTEGER,
      last_activity INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );

    -- Artifacts (PRs, screenshots)
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      url TEXT,
      metadata TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    -- WebSocket client mapping (for hibernation recovery)
    CREATE TABLE IF NOT EXISTS ws_client_mapping (
      ws_id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL,
      client_id TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
  `);
}
```

### Tests

```typescript
// packages/control-plane/src/session/durable-object.test.ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";

describe("SessionDO", () => {
  describe("HTTP API", () => {
    it("GET /state returns session state", async () => {
      const id = env.SESSION_DO.idFromName("test-session");
      const stub = env.SESSION_DO.get(id);

      const response = await stub.fetch("http://fake/state");
      const data = await response.json();

      expect(data).toHaveProperty("session");
      expect(data).toHaveProperty("messages");
      expect(data).toHaveProperty("sandbox");
    });

    it("POST /prompt queues message and returns messageId", async () => {
      const id = env.SESSION_DO.idFromName("test-session");
      const stub = env.SESSION_DO.get(id);

      const response = await stub.fetch("http://fake/prompt", {
        method: "POST",
        body: JSON.stringify({
          content: "Write a hello world function",
          author: { id: "user-1", name: "Test User" },
          model: "claude-sonnet-4"
        })
      });

      const data = await response.json();
      expect(data.messageId).toMatch(/^[a-f0-9-]+$/);
    });

    it("GET /events returns paginated events", async () => {
      // Setup: create some events
      const id = env.SESSION_DO.idFromName("test-session");
      const stub = env.SESSION_DO.get(id);

      const response = await stub.fetch("http://fake/events?limit=10");
      const data = await response.json();

      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe("WebSocket", () => {
    it("accepts WebSocket upgrade with valid token", async () => {
      // TODO: Test WebSocket connection
    });

    it("rejects WebSocket without token", async () => {
      // TODO: Test auth rejection
    });

    it("broadcasts events to all connected clients", async () => {
      // TODO: Test broadcast
    });

    it("survives hibernation and recovers state", async () => {
      // TODO: Test hibernation recovery
    });
  });
});

// packages/control-plane/src/sandbox/lifecycle-manager.test.ts
describe("SandboxLifecycleManager", () => {
  it("spawns sandbox on first prompt", async () => {
    // TODO: Test sandbox spawning
  });

  it("reuses existing sandbox if ready", async () => {
    // TODO: Test sandbox reuse
  });

  it("restores from snapshot after inactivity", async () => {
    // TODO: Test snapshot restoration
  });

  it("handles spawn failures with circuit breaker", async () => {
    // TODO: Test failure handling
  });
});
```

### Wrangler Config

```toml
# packages/control-plane/wrangler.toml
name = "superset-control-plane"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[durable_objects]
bindings = [
  { name = "SESSION_DO", class_name = "SessionDO" }
]

[[migrations]]
tag = "v1"
new_sqlite_classes = ["SessionDO"]

[vars]
MODAL_TOKEN_ID = ""
MODAL_TOKEN_SECRET = ""

# Dev environment
[env.dev]
vars = { ENVIRONMENT = "development" }

# Production
[env.production]
vars = { ENVIRONMENT = "production" }
routes = [
  { pattern = "api.superset.sh/cloud/*", zone_name = "superset.sh" }
]
```

### Files to Create

| File | Description |
|------|-------------|
| `packages/control-plane/package.json` | Package config |
| `packages/control-plane/tsconfig.json` | TypeScript config |
| `packages/control-plane/wrangler.toml` | Cloudflare config |
| `packages/control-plane/src/index.ts` | Worker entry |
| `packages/control-plane/src/router.ts` | HTTP routing |
| `packages/control-plane/src/session/durable-object.ts` | DO class |
| `packages/control-plane/src/session/schema.ts` | SQLite schema |
| `packages/control-plane/src/session/repository.ts` | DB operations |
| `packages/control-plane/src/session/websocket-handler.ts` | WS logic |
| `packages/control-plane/src/sandbox/modal-client.ts` | Modal API |
| `packages/control-plane/src/sandbox/lifecycle-manager.ts` | Sandbox lifecycle |
| `packages/control-plane/src/auth/middleware.ts` | Auth |
| `packages/control-plane/src/**/*.test.ts` | Tests |

### Acceptance Criteria

- [ ] `wrangler dev` starts local development server
- [ ] Session DO initializes SQLite schema on first access
- [ ] HTTP API endpoints respond correctly
- [ ] WebSocket connections authenticate and receive events
- [ ] Events are persisted to SQLite
- [ ] All tests pass with `wrangler test`
- [ ] Can deploy to Cloudflare with `wrangler deploy`

---

## Phase 5: Data Plane (Modal Sandboxes)

**Goal:** Isolated compute environments running Claude Code

### Milestones

- [ ] **M5.1** Create Modal sandbox image with Claude Code pre-installed
- [ ] **M5.2** Implement supervisor process for sandbox lifecycle
- [ ] **M5.3** Create bridge for WebSocket communication with control plane
- [ ] **M5.4** Add git sync functionality
- [ ] **M5.5** Implement snapshot/restore support

### Package Structure

```
packages/modal-infra/
├── src/
│   ├── __init__.py
│   ├── app.py                  # Modal App definition
│   ├── image.py                # Docker image config
│   ├── sandbox/
│   │   ├── __init__.py
│   │   ├── entrypoint.py       # Supervisor process
│   │   ├── bridge.py           # WS → Claude Code bridge
│   │   ├── git_sync.py         # Git operations
│   │   └── agent.py            # Claude Code wrapper
│   └── functions.py            # Modal functions
├── requirements.txt
├── pyproject.toml
└── tests/
    ├── test_bridge.py
    ├── test_git_sync.py
    └── test_agent.py
```

### Sandbox Image

```python
# packages/modal-infra/src/image.py
import modal

base_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install([
        "git", "curl", "wget", "jq", "ripgrep", "fzf",
        "build-essential", "libssl-dev", "zlib1g-dev",
    ])
    # Node.js for Claude Code
    .run_commands([
        "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -",
        "apt-get install -y nodejs",
    ])
    # Claude Code
    .run_commands([
        "npm install -g @anthropic-ai/claude-code",
    ])
    # Python dependencies
    .pip_install([
        "websockets>=12.0",
        "httpx>=0.26.0",
        "pydantic>=2.0",
    ])
    # Copy our sandbox code
    .add_local_dir("src/sandbox", "/app/sandbox")
)
```

### Supervisor Process

```python
# packages/modal-infra/src/sandbox/entrypoint.py
import asyncio
import os
import signal
import sys
from typing import Optional

from .bridge import Bridge
from .git_sync import GitSync
from .agent import AgentRunner

class Supervisor:
    """Main supervisor process for sandbox lifecycle."""

    def __init__(self):
        self.sandbox_id = os.environ["SANDBOX_ID"]
        self.control_plane_url = os.environ["CONTROL_PLANE_URL"]
        self.auth_token = os.environ["SANDBOX_AUTH_TOKEN"]
        self.session_config = json.loads(os.environ.get("SESSION_CONFIG", "{}"))

        self.bridge: Optional[Bridge] = None
        self.agent: Optional[AgentRunner] = None
        self.git_sync: Optional[GitSync] = None
        self.shutdown_event = asyncio.Event()

    async def start(self):
        """Start supervisor and all sub-processes."""
        # Setup signal handlers
        loop = asyncio.get_event_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, self._handle_shutdown)

        try:
            # 1. Git sync (clone/fetch repo)
            self.git_sync = GitSync(self.session_config)
            await self.git_sync.sync()

            # 2. Start bridge to control plane
            self.bridge = Bridge(
                control_plane_url=self.control_plane_url,
                sandbox_id=self.sandbox_id,
                auth_token=self.auth_token,
            )
            await self.bridge.connect()

            # 3. Start agent runner
            self.agent = AgentRunner(self.session_config)

            # 4. Wire bridge commands to agent
            self.bridge.on_command = self._handle_command

            # 5. Send ready signal
            await self.bridge.send_event({
                "type": "ready",
                "sandbox_id": self.sandbox_id,
            })

            # 6. Start heartbeat loop
            asyncio.create_task(self._heartbeat_loop())

            # 7. Wait for shutdown
            await self.shutdown_event.wait()

        except Exception as e:
            print(f"[supervisor] Fatal error: {e}", file=sys.stderr)
            sys.exit(1)
        finally:
            await self._cleanup()

    async def _handle_command(self, command: dict):
        """Handle command from control plane."""
        cmd_type = command["type"]

        if cmd_type == "prompt":
            await self._handle_prompt(command)
        elif cmd_type == "stop":
            await self.agent.stop()
        elif cmd_type == "push":
            await self._handle_push(command)
        elif cmd_type == "snapshot":
            await self._prepare_snapshot()
        elif cmd_type == "shutdown":
            self.shutdown_event.set()

    async def _handle_prompt(self, command: dict):
        """Run agent with prompt, streaming events to bridge."""
        message_id = command["message_id"]
        content = command["content"]
        author = command.get("author", {})
        model = command.get("model")

        # Configure git identity for this prompt
        if author.get("github_email"):
            await self.git_sync.configure_identity(
                name=author.get("github_name", author.get("id")),
                email=author["github_email"],
            )

        # Run agent and stream events
        async for event in self.agent.run(content, model=model):
            event["message_id"] = message_id
            await self.bridge.send_event(event)

        # Send completion event
        await self.bridge.send_event({
            "type": "execution_complete",
            "message_id": message_id,
        })

    async def _heartbeat_loop(self):
        """Send periodic heartbeats."""
        while not self.shutdown_event.is_set():
            await self.bridge.send_event({"type": "heartbeat"})
            await asyncio.sleep(30)

    def _handle_shutdown(self):
        """Handle shutdown signal."""
        print("[supervisor] Received shutdown signal")
        self.shutdown_event.set()

    async def _cleanup(self):
        """Cleanup resources."""
        if self.agent:
            await self.agent.stop()
        if self.bridge:
            await self.bridge.close()


if __name__ == "__main__":
    supervisor = Supervisor()
    asyncio.run(supervisor.start())
```

### Bridge Process

```python
# packages/modal-infra/src/sandbox/bridge.py
import asyncio
import json
from typing import Callable, Optional
import websockets
from websockets.exceptions import ConnectionClosed

class Bridge:
    """WebSocket bridge to control plane."""

    def __init__(
        self,
        control_plane_url: str,
        sandbox_id: str,
        auth_token: str,
    ):
        self.url = f"{control_plane_url}/sandbox/ws"
        self.sandbox_id = sandbox_id
        self.auth_token = auth_token
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.on_command: Optional[Callable] = None
        self._reconnect_delay = 1
        self._max_reconnect_delay = 60

    async def connect(self):
        """Connect to control plane with reconnection logic."""
        while True:
            try:
                self.ws = await websockets.connect(
                    self.url,
                    additional_headers={
                        "Authorization": f"Bearer {self.auth_token}",
                        "X-Sandbox-ID": self.sandbox_id,
                    },
                )
                self._reconnect_delay = 1  # Reset on success

                # Start receive loop
                asyncio.create_task(self._receive_loop())
                return

            except Exception as e:
                print(f"[bridge] Connection failed: {e}, retrying in {self._reconnect_delay}s")
                await asyncio.sleep(self._reconnect_delay)
                self._reconnect_delay = min(
                    self._reconnect_delay * 2,
                    self._max_reconnect_delay
                )

    async def _receive_loop(self):
        """Receive and dispatch commands."""
        try:
            async for message in self.ws:
                command = json.loads(message)
                if self.on_command:
                    asyncio.create_task(self.on_command(command))
        except ConnectionClosed as e:
            if e.code == 410:  # Gone - session terminated
                print("[bridge] Session terminated, exiting")
                raise SystemExit(0)
            else:
                print(f"[bridge] Connection closed ({e.code}), reconnecting")
                await self.connect()

    async def send_event(self, event: dict):
        """Send event to control plane."""
        if self.ws:
            event["sandbox_id"] = self.sandbox_id
            event["timestamp"] = int(asyncio.get_event_loop().time() * 1000)
            await self.ws.send(json.dumps(event))

    async def close(self):
        """Close connection."""
        if self.ws:
            await self.ws.close()
```

### Tests

```python
# packages/modal-infra/tests/test_bridge.py
import pytest
import asyncio
from unittest.mock import AsyncMock, patch
from src.sandbox.bridge import Bridge

@pytest.mark.asyncio
async def test_bridge_connects_with_auth():
    """Bridge should connect with correct auth headers."""
    with patch("websockets.connect") as mock_connect:
        mock_ws = AsyncMock()
        mock_connect.return_value = mock_ws

        bridge = Bridge(
            control_plane_url="wss://api.superset.sh",
            sandbox_id="sandbox-123",
            auth_token="token-abc",
        )
        await bridge.connect()

        mock_connect.assert_called_once()
        call_kwargs = mock_connect.call_args.kwargs
        assert call_kwargs["additional_headers"]["Authorization"] == "Bearer token-abc"
        assert call_kwargs["additional_headers"]["X-Sandbox-ID"] == "sandbox-123"

@pytest.mark.asyncio
async def test_bridge_reconnects_on_failure():
    """Bridge should reconnect with exponential backoff."""
    with patch("websockets.connect") as mock_connect:
        mock_connect.side_effect = [Exception("Failed"), AsyncMock()]

        bridge = Bridge(
            control_plane_url="wss://api.superset.sh",
            sandbox_id="sandbox-123",
            auth_token="token-abc",
        )

        with patch("asyncio.sleep") as mock_sleep:
            await bridge.connect()
            mock_sleep.assert_called_with(1)  # Initial delay

@pytest.mark.asyncio
async def test_bridge_dispatches_commands():
    """Bridge should dispatch received commands to handler."""
    handler = AsyncMock()

    with patch("websockets.connect") as mock_connect:
        mock_ws = AsyncMock()
        mock_ws.__aiter__.return_value = ['{"type": "prompt", "content": "hello"}']
        mock_connect.return_value = mock_ws

        bridge = Bridge(
            control_plane_url="wss://api.superset.sh",
            sandbox_id="sandbox-123",
            auth_token="token-abc",
        )
        bridge.on_command = handler
        await bridge.connect()

        # Give receive loop time to process
        await asyncio.sleep(0.1)

        handler.assert_called_once()
        call_args = handler.call_args[0][0]
        assert call_args["type"] == "prompt"

# packages/modal-infra/tests/test_git_sync.py
@pytest.mark.asyncio
async def test_git_sync_clones_repo():
    """GitSync should clone repo on first sync."""
    # TODO: Test git clone
    pass

@pytest.mark.asyncio
async def test_git_sync_fetches_existing_repo():
    """GitSync should fetch if repo already exists."""
    # TODO: Test git fetch
    pass

@pytest.mark.asyncio
async def test_git_sync_configures_identity():
    """GitSync should configure git identity."""
    # TODO: Test git config
    pass
```

### Files to Create

| File | Description |
|------|-------------|
| `packages/modal-infra/pyproject.toml` | Python package config |
| `packages/modal-infra/requirements.txt` | Dependencies |
| `packages/modal-infra/src/__init__.py` | Package init |
| `packages/modal-infra/src/app.py` | Modal App |
| `packages/modal-infra/src/image.py` | Docker image |
| `packages/modal-infra/src/functions.py` | Modal functions |
| `packages/modal-infra/src/sandbox/entrypoint.py` | Supervisor |
| `packages/modal-infra/src/sandbox/bridge.py` | WebSocket bridge |
| `packages/modal-infra/src/sandbox/git_sync.py` | Git operations |
| `packages/modal-infra/src/sandbox/agent.py` | Claude Code wrapper |
| `packages/modal-infra/tests/*.py` | Tests |

### Acceptance Criteria

- [ ] Modal image builds successfully with Claude Code
- [ ] Sandbox connects to control plane via WebSocket
- [ ] Commands from control plane execute in sandbox
- [ ] Agent output streams back to control plane
- [ ] Git operations work (clone, fetch, push)
- [ ] Snapshot/restore preserves workspace state
- [ ] All tests pass with `pytest`

---

## Phase 6: Web Session UI

**Goal:** Web interface for cloud workspace interaction

### Milestones

- [ ] **M6.1** Create session page with chat/timeline layout
- [ ] **M6.2** Implement useSessionSocket hook for WebSocket communication
- [ ] **M6.3** Build event timeline component with tool call grouping
- [ ] **M6.4** Add chat input with model selection
- [ ] **M6.5** Create artifacts panel (PRs, screenshots)

### Page Structure

```
apps/web/src/app/(dashboard)/session/[sessionId]/
├── page.tsx              # Main session page
├── components/
│   ├── SessionHeader.tsx
│   ├── EventTimeline.tsx
│   ├── ChatInput.tsx
│   ├── ArtifactsPanel.tsx
│   ├── ToolCallGroup.tsx
│   └── index.ts
└── hooks/
    └── useSessionSocket.ts
```

### Tests

```typescript
// apps/web/src/app/(dashboard)/session/[sessionId]/components/EventTimeline.test.tsx
describe("EventTimeline", () => {
  it("renders user messages with author attribution", () => {
    const events = [
      { type: "user_message", content: "Hello", author: { name: "Test User" } }
    ];

    render(<EventTimeline events={events} />);

    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Test User")).toBeInTheDocument();
  });

  it("groups consecutive tool calls", () => {
    const events = [
      { type: "tool_call", name: "Read", input: { path: "/foo" } },
      { type: "tool_result", output: "contents" },
      { type: "tool_call", name: "Edit", input: { path: "/foo" } },
      { type: "tool_result", output: "edited" },
    ];

    render(<EventTimeline events={events} />);

    // Should show collapsed group with count
    expect(screen.getByText("2 tool calls")).toBeInTheDocument();
  });

  it("renders assistant text responses", () => {
    const events = [
      { type: "text", content: "I've made the changes" }
    ];

    render(<EventTimeline events={events} />);

    expect(screen.getByText("I've made the changes")).toBeInTheDocument();
  });
});

// apps/web/src/app/(dashboard)/session/[sessionId]/hooks/useSessionSocket.test.ts
describe("useSessionSocket", () => {
  it("connects to WebSocket with auth token", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ token: "test-token" })
    });
    global.fetch = mockFetch;

    const { result } = renderHook(() => useSessionSocket("session-123"));

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
    });
  });

  it("accumulates events from WebSocket", async () => {
    // TODO: Test event accumulation
  });

  it("sendPrompt sends correct message format", async () => {
    // TODO: Test sending prompts
  });

  it("reconnects on connection loss", async () => {
    // TODO: Test reconnection
  });
});
```

### Files to Create

| File | Description |
|------|-------------|
| `apps/web/src/app/(dashboard)/session/[sessionId]/page.tsx` | Main page |
| `apps/web/src/app/(dashboard)/session/[sessionId]/components/*.tsx` | UI components |
| `apps/web/src/app/(dashboard)/session/[sessionId]/hooks/useSessionSocket.ts` | WebSocket hook |
| `apps/web/src/app/(dashboard)/session/[sessionId]/**/*.test.tsx` | Tests |

### Acceptance Criteria

- [ ] Session page loads and connects to WebSocket
- [ ] Events stream in real-time
- [ ] User can send prompts
- [ ] Tool calls display with expand/collapse
- [ ] Stop button cancels running execution
- [ ] PRs and artifacts show in sidebar
- [ ] All tests pass

---

## Summary: Test Coverage

| Phase | Unit Tests | Integration Tests | E2E Tests |
|-------|------------|-------------------|-----------|
| Phase 1 | tRPC router procedures | ElectricSQL sync | - |
| Phase 2 | React components | Sidebar rendering | Click → navigate |
| Phase 3 | WebView component | Error handling | Load session |
| Phase 4 | DO methods, repository | WebSocket auth | Full session flow |
| Phase 5 | Bridge, git sync | Modal sandbox spawn | Agent execution |
| Phase 6 | UI components | WebSocket hook | Full chat flow |

## Commands Reference

```bash
# Phase 1
bun test packages/trpc/src/routers/cloud-workspace.test.ts
bun run db:push  # Apply schema changes

# Phase 2
bun test apps/desktop/src/renderer/**/CloudSection/**/*.test.tsx

# Phase 3
bun test apps/desktop/src/renderer/**/CloudWorkspaceView/**/*.test.tsx

# Phase 4
cd packages/control-plane && wrangler test
cd packages/control-plane && wrangler dev  # Local development

# Phase 5
cd packages/modal-infra && pytest
cd packages/modal-infra && modal serve src.app  # Local Modal server

# Phase 6
bun test apps/web/src/app/**/session/**/*.test.tsx
```

## Dependencies Between Phases

```
Phase 1 (Database) ──┬──► Phase 2 (Desktop Sidebar)
                     │
                     └──► Phase 4 (Control Plane) ──► Phase 5 (Modal) ──► Phase 6 (Web UI)
                                                              │
                                                              ▼
                                                    Phase 3 (WebView) ◄───┘
```

- **Phase 1** is foundational - start here
- **Phases 2 & 4** can proceed in parallel after Phase 1
- **Phase 3** depends on Phase 6 (needs web UI to embed)
- **Phase 5** depends on Phase 4 (needs control plane to connect to)
- **Phase 6** depends on Phase 4 (needs control plane API)

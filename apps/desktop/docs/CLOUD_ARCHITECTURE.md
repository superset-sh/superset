# Superset Cloud Architecture

Based on [Ramp's Inspect article](https://engineering.ramp.com/inspect) and the modal-vibe reference implementation.

## Overview

A cloud-based coding agent platform that:
- Runs isolated dev environments in Modal sandboxes
- Manages state via Cloudflare Durable Objects
- Bridges seamlessly to the desktop app for local continuation
- Integrates with Linear, GitHub, and Slack

---

## Reference Architectures

### Ramp's Inspect Stack

| Layer | Technology |
|-------|------------|
| Sandbox VMs | Modal - instant spin-up, filesystem snapshots |
| API/State | Cloudflare Durable Objects - per-session SQLite |
| Real-time | Cloudflare Agents SDK + WebSocket Hibernation |
| Agent | OpenCode - server-first, typed SDK, plugin system |
| Integrations | Sentry, Datadog, LaunchDarkly, GitHub, Slack, Buildkite |

### Modal Vibe (Starting Point)

| Layer | Technology |
|-------|------------|
| Sandbox VMs | Modal Sandboxes with Node.js + Python |
| State | Modal Dict (distributed KV) |
| Tunnels | HTTPS tunnels per sandbox (API + frontend) |
| LLM | Claude generates/modifies React components |

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENTS                                  │
├──────────┬──────────┬──────────┬──────────┬────────────────┤
│ Desktop  │   Web    │  Slack   │  Linear  │ Chrome Ext     │
│ (Electron)│         │   Bot    │ Webhook  │                │
└────┬─────┴────┬─────┴────┬─────┴────┬─────┴───────┬────────┘
     │          │          │          │             │
     └──────────┴──────────┼──────────┴─────────────┘
                           │
              ┌────────────▼────────────┐
              │   Cloudflare Workers    │
              │   (API + Auth + Router) │
              └────────────┬────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────┐  ┌─────────────────┐  ┌───────────┐
│  Durable    │  │  Modal Sandbox  │  │  GitHub   │
│  Objects    │  │  (per session)  │  │  + Linear │
│  (state)    │  │                 │  │           │
│             │  │  ┌───────────┐  │  └───────────┘
│  - SQLite   │  │  │ Terminal  │  │
│  - Messages │  │  │ (node-pty)│  │
│  - Files    │  │  ├───────────┤  │
│  - Events   │  │  │ Agent     │  │
│             │  │  │ (Claude)  │  │
└─────────────┘  │  ├───────────┤  │
                 │  │ Dev Server│  │
                 │  │ (Vite)    │  │
                 │  ├───────────┤  │
                 │  │ Git + FS  │  │
                 │  └───────────┘  │
                 └─────────────────┘
```

---

## Sandbox Architecture

### Pre-installed Agent Environment

Each sandbox VM comes with coding agents pre-installed and configured:

```dockerfile
# Base image built every 30 minutes
FROM node:22-slim

# System dependencies
RUN apt-get update && apt-get install -y \
    git curl python3 python3-pip

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Install OpenCode (alternative agent)
RUN curl -fsSL https://opencode.ai/install.sh | bash

# Install user's preferred shell + tools
RUN apt-get install -y zsh fzf ripgrep

# Pre-configure agent settings directory
RUN mkdir -p /root/.config/claude-code
```

### User Environment Sync

User's local config synced to sandbox on session start:

```typescript
interface UserEnvConfig {
  // Shell configuration
  shell: "bash" | "zsh" | "fish";
  shellRc: string;  // .zshrc, .bashrc contents

  // Agent configuration
  claudeConfig: {
    settings: ClaudeSettings;
    mcpServers: MCPServerConfig[];
    permissions: PermissionConfig;
  };

  // Git identity
  git: {
    name: string;
    email: string;
  };

  // Editor preferences
  vscode: {
    settings: Record<string, unknown>;
    extensions: string[];
  };
}

async function syncUserEnv(sandboxId: string, config: UserEnvConfig) {
  // Write shell config
  await sandbox.writeFile("~/.zshrc", config.shellRc);

  // Write Claude Code config
  await sandbox.writeFile(
    "~/.config/claude-code/settings.json",
    JSON.stringify(config.claudeConfig.settings)
  );

  // Configure MCP servers
  await sandbox.writeFile(
    "~/.config/claude-code/mcp.json",
    JSON.stringify(config.claudeConfig.mcpServers)
  );

  // Set git identity
  await sandbox.exec(`git config --global user.name "${config.git.name}"`);
  await sandbox.exec(`git config --global user.email "${config.git.email}"`);
}
```

### Agent Execution Modes

```typescript
// 1. Headless mode - agent runs autonomously
async function runAgentHeadless(sessionId: string, prompt: string) {
  const sandbox = await getSandbox(sessionId);

  // Run Claude Code in non-interactive mode
  const result = await sandbox.exec(
    `claude-code --print "${prompt}"`,
    { env: { ANTHROPIC_API_KEY: await getApiKey(sessionId) } }
  );

  return result;
}

// 2. Interactive mode - user can chat with agent
async function runAgentInteractive(sessionId: string) {
  const sandbox = await getSandbox(sessionId);

  // Start Claude Code server mode
  const process = await sandbox.spawn("claude-code", ["--server"], {
    env: { ANTHROPIC_API_KEY: await getApiKey(sessionId) }
  });

  // Connect WebSocket for streaming
  return connectAgentStream(process);
}

// 3. Background mode - agent works while user does other things
async function runAgentBackground(sessionId: string, prompt: string) {
  const sandbox = await getSandbox(sessionId);

  // Start agent in background, notify on completion
  await sandbox.exec(`
    nohup claude-code --print "${prompt}" > /tmp/agent.log 2>&1 &
    echo $! > /tmp/agent.pid
  `);

  // Poll for completion and notify via webhook
  watchAgentCompletion(sessionId, "/tmp/agent.pid", "/tmp/agent.log");
}
```

---

## State Management

### Durable Object Per Session

```typescript
export class SessionDO extends DurableObject {
  private sql: SqlStorage;
  private sessions: Map<WebSocket, ClientInfo> = new Map();

  constructor(state: DurableObjectState) {
    super(state);
    this.sql = state.storage.sql;
    this.initSchema();
  }

  private initSchema() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY,
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS terminal_state (
        pane_id TEXT PRIMARY KEY,
        scrollback TEXT,
        cursor_x INTEGER,
        cursor_y INTEGER
      );
    `);
  }

  // Multiplayer: broadcast to all connected clients
  broadcast(event: SessionEvent, exclude?: WebSocket) {
    for (const [ws, _] of this.sessions) {
      if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(event));
      }
    }
  }

  // Handle incoming message from any client
  async handleMessage(ws: WebSocket, data: ClientMessage) {
    const client = this.sessions.get(ws);

    switch (data.type) {
      case "prompt":
        // Store message with author attribution
        this.sql.exec(
          `INSERT INTO messages (author_id, author_name, content) VALUES (?, ?, ?)`,
          [client.userId, client.userName, data.content]
        );

        // Broadcast to other clients
        this.broadcast({ type: "new_message", ...data, author: client }, ws);

        // Forward to sandbox agent
        await this.forwardToAgent(data.content);
        break;

      case "file_change":
        // Sync file state
        this.sql.exec(
          `INSERT OR REPLACE INTO files (path, content) VALUES (?, ?)`,
          [data.path, data.content]
        );
        this.broadcast({ type: "file_change", ...data }, ws);
        break;
    }
  }
}
```

---

## API Layer

### tRPC Router (Mirrors Desktop Interface)

```typescript
export const cloudRouter = router({
  session: router({
    create: protectedProcedure
      .input(z.object({
        repoUrl: z.string(),
        branch: z.string().optional(),
        prompt: z.string().optional(),
        linearIssueId: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // 1. Spin up Modal sandbox
        const sandbox = await createSandbox(input.repoUrl);

        // 2. Create Durable Object for state
        const sessionId = crypto.randomUUID();
        const stub = ctx.env.SESSION_DO.get(
          ctx.env.SESSION_DO.idFromName(sessionId)
        );

        // 3. Sync user's env config
        await syncUserEnv(sandbox.id, ctx.user.envConfig);

        // 4. Link Linear issue if provided
        if (input.linearIssueId) {
          await linkLinearIssue(sessionId, input.linearIssueId);
        }

        // 5. Start agent with initial prompt
        if (input.prompt) {
          await stub.fetch("/agent/prompt", {
            method: "POST",
            body: JSON.stringify({ prompt: input.prompt }),
          });
        }

        return { sessionId, tunnelUrl: sandbox.tunnelUrl };
      }),

    // Get session for desktop handoff
    getState: protectedProcedure
      .input(z.object({ sessionId: z.string() }))
      .query(async ({ input, ctx }) => {
        const stub = ctx.env.SESSION_DO.get(
          ctx.env.SESSION_DO.idFromName(input.sessionId)
        );
        return stub.fetch("/state").then(r => r.json());
      }),
  }),

  terminal: router({
    // Same interface as desktop
    createOrAttach: protectedProcedure
      .input(z.object({
        sessionId: z.string(),
        paneId: z.string(),
      }))
      .subscription(async function* ({ input, ctx }) {
        const sandbox = await getSandbox(input.sessionId);
        const ws = await sandbox.connectTerminal(input.paneId);

        for await (const data of ws) {
          yield { type: "data", data };
        }
      }),

    write: protectedProcedure
      .input(z.object({
        sessionId: z.string(),
        paneId: z.string(),
        data: z.string(),
      }))
      .mutation(async ({ input }) => {
        const sandbox = await getSandbox(input.sessionId);
        await sandbox.writeTerminal(input.paneId, input.data);
      }),
  }),

  agent: router({
    prompt: protectedProcedure
      .input(z.object({
        sessionId: z.string(),
        message: z.string(),
      }))
      .subscription(async function* ({ input, ctx }) {
        const sandbox = await getSandbox(input.sessionId);

        // Stream agent response
        const stream = await sandbox.agentPrompt(input.message);
        for await (const chunk of stream) {
          yield chunk;
        }
      }),

    stop: protectedProcedure
      .input(z.object({ sessionId: z.string() }))
      .mutation(async ({ input }) => {
        const sandbox = await getSandbox(input.sessionId);
        await sandbox.exec("kill $(cat /tmp/agent.pid)");
      }),
  }),

  git: router({
    createPR: protectedProcedure
      .input(z.object({
        sessionId: z.string(),
        title: z.string(),
        body: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const sandbox = await getSandbox(input.sessionId);

        // Push changes
        await sandbox.exec("git push -u origin HEAD");

        // Create PR as user (not bot)
        const pr = await ctx.github.createPR({
          title: input.title,
          body: input.body,
          head: await sandbox.exec("git branch --show-current"),
        });

        // Update Linear issue if linked
        const session = await getSession(input.sessionId);
        if (session.linearIssueId) {
          await updateLinearIssue(session.linearIssueId, {
            state: "in-review",
            attachments: [{ url: pr.url, title: pr.title }],
          });
        }

        return pr;
      }),
  }),

  linear: router({
    linkIssue: protectedProcedure
      .input(z.object({
        sessionId: z.string(),
        issueId: z.string(),
      }))
      .mutation(async ({ input }) => {
        await linkLinearIssue(input.sessionId, input.issueId);

        // Update issue status
        await updateLinearIssue(input.issueId, {
          state: "in-progress",
        });
      }),
  }),
});
```

---

## Desktop Integration

### CloudWorkspaceRuntime

```typescript
// Implements same interface as LocalWorkspaceRuntime
export class CloudWorkspaceRuntime implements WorkspaceRuntime {
  readonly id: WorkspaceRuntimeId;
  readonly terminal: CloudTerminalRuntime;
  readonly capabilities = {
    terminal: { persistent: true, coldRestore: true }
  };

  constructor(private sessionId: string) {
    this.id = `cloud:${sessionId}`;
    this.terminal = new CloudTerminalRuntime(sessionId);
  }
}

export class CloudTerminalRuntime implements TerminalRuntime {
  private ws: WebSocket | null = null;
  private emitter = new EventEmitter();

  constructor(private sessionId: string) {}

  async createOrAttach(params: CreateOrAttachParams): Promise<SessionResult> {
    // Connect to cloud terminal via WebSocket
    this.ws = new WebSocket(
      `wss://api.superset.sh/session/${this.sessionId}/terminal/${params.paneId}`
    );

    this.ws.onmessage = (event) => {
      this.emitter.emit("data", {
        paneId: params.paneId,
        data: event.data,
      });
    };

    return { paneId: params.paneId, backendSessionId: params.paneId };
  }

  write({ paneId, data }: WriteParams): void {
    this.ws?.send(JSON.stringify({ type: "write", paneId, data }));
  }

  resize({ paneId, cols, rows }: ResizeParams): void {
    this.ws?.send(JSON.stringify({ type: "resize", paneId, cols, rows }));
  }

  on(event: string, listener: (...args: any[]) => void): this {
    this.emitter.on(event, listener);
    return this;
  }
}
```

### Runtime Registry Extension

```typescript
// registry.ts
export class WorkspaceRuntimeRegistry {
  getForWorkspaceId(workspaceId: string): WorkspaceRuntime {
    const workspace = getWorkspace(workspaceId);

    // Cloud workspace - connect to remote sandbox
    if (workspace.cloudSessionId) {
      return new CloudWorkspaceRuntime(workspace.cloudSessionId);
    }

    // Local workspace (existing behavior)
    return new LocalWorkspaceRuntime(workspaceId);
  }
}
```

### Cloud → Local Handoff

```typescript
async function claimCloudSession(cloudSessionId: string): Promise<Worktree> {
  // 1. Get session state from cloud
  const session = await cloudApi.session.getState({ sessionId: cloudSessionId });

  // 2. Create local worktree
  const worktree = await createWorktree({
    repo: session.repoPath,
    branch: session.branch,
  });

  // 3. Fetch and checkout cloud changes
  await exec(`git -C ${worktree.path} fetch origin ${session.branch}`);
  await exec(`git -C ${worktree.path} checkout ${session.branch}`);

  // 4. Restore terminal scrollback
  for (const terminal of session.terminals) {
    await restoreTerminalScrollback(worktree.id, terminal.paneId, terminal.scrollback);
  }

  // 5. Keep reference for sync-back (optional)
  await updateWorktree(worktree.id, { cloudSessionId });

  return worktree;
}

// Sync local changes back to cloud
async function syncToCloud(worktreeId: string) {
  const worktree = getWorktree(worktreeId);
  if (!worktree.cloudSessionId) return;

  // Push local commits
  await exec(`git -C ${worktree.path} push origin ${worktree.branch}`);

  // Notify cloud session to pull
  await cloudApi.git.pull({ sessionId: worktree.cloudSessionId });
}
```

---

## Linear Integration

### Webhook Handler

```typescript
// Listen for Linear issue updates
app.post("/webhooks/linear", async (req, res) => {
  const event = req.body;

  switch (event.type) {
    case "Issue":
      if (event.action === "update" && event.data.stateId === STARTED_STATE_ID) {
        // Issue moved to "Started" - offer to create session
        await notifySlack(event.data.team.id, {
          text: `Issue ${event.data.identifier} started. Create a coding session?`,
          actions: [
            { type: "button", text: "Start Session", value: event.data.id }
          ]
        });
      }
      break;

    case "Comment":
      // Check for @superset mentions
      if (event.data.body.includes("@superset")) {
        const prompt = event.data.body.replace("@superset", "").trim();
        const session = await findSessionForIssue(event.data.issueId);

        if (session) {
          // Send prompt to existing session
          await cloudApi.agent.prompt({
            sessionId: session.id,
            message: prompt,
          });
        }
      }
      break;
  }
});
```

### Auto-link Issues

```typescript
// When creating a session from Linear
async function createSessionFromLinear(issueId: string, userId: string) {
  const issue = await linear.issue(issueId);

  // Parse repo from issue labels or project
  const repo = await inferRepoFromIssue(issue);

  // Create branch name from issue
  const branch = `${issue.identifier.toLowerCase()}-${slugify(issue.title)}`;

  // Create session
  const session = await cloudApi.session.create({
    repoUrl: repo.url,
    branch,
    prompt: `Implement: ${issue.title}\n\n${issue.description}`,
    linearIssueId: issueId,
  });

  // Update issue with session link
  await linear.updateIssue(issueId, {
    description: issue.description + `\n\n---\n[Superset Session](${session.url})`,
  });

  return session;
}
```

---

## Implementation Phases

### Phase 1: Sandbox Infrastructure
- [ ] Extend modal-vibe sandbox with terminal WebSocket server
- [ ] Add file system API endpoints
- [ ] Pre-built images per repo (30-min rebuild cycle)
- [ ] Git credential injection (GitHub App token)
- [ ] Pre-install Claude Code + OpenCode

### Phase 2: State + API
- [ ] Durable Object per session (SQLite state)
- [ ] tRPC API matching desktop interface
- [ ] Real-time subscriptions via WebSocket
- [ ] User env config sync

### Phase 3: Desktop Integration
- [ ] `CloudWorkspaceRuntime` implementing existing interface
- [ ] Session claim/handoff flow
- [ ] Bidirectional sync option
- [ ] Terminal scrollback restoration

### Phase 4: Agent + Integrations
- [ ] Claude Code running in sandbox
- [ ] Linear integration (link issues, update status, webhooks)
- [ ] GitHub PR creation as user
- [ ] Slack bot client

### Phase 5: Clients
- [ ] Web UI (session editor, live preview)
- [ ] Chrome extension (visual React editing)
- [ ] Mobile-friendly web
- [ ] Voice input

---

## Key Principles (from Ramp)

1. **Pre-warm everything** - Build images every 30 min, warm pools for high-volume repos
2. **Let agent read before sync completes** - Only block writes
3. **Multiplayer is critical** - Attribute prompts to authors, sync across clients
4. **GitHub auth as user** - PRs opened by the person, not a bot
5. **Virality through public spaces** - Slack bot makes usage visible
6. **Speed is everything** - Session speed limited only by model TTFT

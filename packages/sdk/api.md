# Tasks

Types:

- <code><a href="./src/resources/tasks.ts">Task</a></code>
- <code><a href="./src/resources/tasks.ts">TaskListItem</a></code>
- <code><a href="./src/resources/tasks.ts">TaskListParams</a></code>
- <code><a href="./src/resources/tasks.ts">TaskListResponse</a></code>
- <code><a href="./src/resources/tasks.ts">TaskCreateParams</a></code>
- <code><a href="./src/resources/tasks.ts">TaskUpdateParams</a></code>

Methods:

- <code title="post /api/trpc/task.create">client.tasks.<a href="./src/resources/tasks.ts">create</a>({ ...params }) -> Task</code>
- <code title="get /api/trpc/task.byIdOrSlug">client.tasks.<a href="./src/resources/tasks.ts">retrieve</a>(idOrSlug) -> Task</code>
- <code title="get /api/trpc/task.list">client.tasks.<a href="./src/resources/tasks.ts">list</a>({ ...params }) -> TaskListResponse</code>
- <code title="post /api/trpc/task.update">client.tasks.<a href="./src/resources/tasks.ts">update</a>({ ...params }) -> Task</code>
- <code title="post /api/trpc/task.delete">client.tasks.<a href="./src/resources/tasks.ts">delete</a>(id) -> void</code>

## Statuses

Types:

- <code><a href="./src/resources/tasks.ts">TaskStatus</a></code>
- <code><a href="./src/resources/tasks.ts">TaskStatusListResponse</a></code>

Methods:

- <code title="get /api/trpc/task.statuses.list">client.tasks.statuses.<a href="./src/resources/tasks.ts">list</a>() -> TaskStatusListResponse</code>

# Workspaces

Types:

- <code><a href="./src/resources/workspaces.ts">CloudWorkspace</a></code>
- <code><a href="./src/resources/workspaces.ts">CloudWorkspaceStatus</a></code>
- <code><a href="./src/resources/workspaces.ts">WorkspaceListParams</a></code>
- <code><a href="./src/resources/workspaces.ts">WorkspaceListResponse</a></code>
- <code><a href="./src/resources/workspaces.ts">WorkspaceCreateParams</a></code>
- <code><a href="./src/resources/workspaces.ts">WorkspaceUpdateParams</a></code>
- <code><a href="./src/resources/workspaces.ts">WorkspaceDeleteResult</a></code>

Methods:

- <code title="get /api/trpc/cloudWorkspace.list">client.workspaces.<a href="./src/resources/workspaces.ts">list</a>({ search? }) -> WorkspaceListResponse</code>
- <code title="get /api/trpc/cloudWorkspace.list">client.workspaces.<a href="./src/resources/workspaces.ts">retrieve</a>(id) -> CloudWorkspace | null</code>
- <code title="post /api/trpc/cloudWorkspace.create">client.workspaces.<a href="./src/resources/workspaces.ts">create</a>({ environment?, name?, branch?, agent?, prompt?, model?, effort? }) -> CloudWorkspace</code>
- <code title="post /api/trpc/cloudWorkspace.rename">client.workspaces.<a href="./src/resources/workspaces.ts">update</a>(id, { name }) -> CloudWorkspace</code>
- <code title="post /api/trpc/cloudWorkspace.delete">client.workspaces.<a href="./src/resources/workspaces.ts">delete</a>(id) -> WorkspaceDeleteResult</code>

# Agents

Types:

- <code><a href="./src/resources/agents.ts">AgentCreateParams</a></code>
- <code><a href="./src/resources/agents.ts">AgentCreateResult</a></code>

Methods:

- <code title="workspace post /trpc/agents.run">client.agents.<a href="./src/resources/agents.ts">create</a>({ workspaceId, agent, prompt?, resumeSessionId?, model?, effort? }) -> AgentCreateResult</code>

# Terminals

Types:

- <code><a href="./src/resources/terminals.ts">TerminalCreateParams</a></code>
- <code><a href="./src/resources/terminals.ts">TerminalCreateResult</a></code>
- <code><a href="./src/resources/terminals.ts">TerminalListParams</a></code>
- <code><a href="./src/resources/terminals.ts">TerminalListResult</a></code>
- <code><a href="./src/resources/terminals.ts">TerminalSummary</a></code>
- <code><a href="./src/resources/terminals.ts">TerminalSendParams</a></code>
- <code><a href="./src/resources/terminals.ts">TerminalSendResult</a></code>
- <code><a href="./src/resources/terminals.ts">TerminalReadParams</a></code>
- <code><a href="./src/resources/terminals.ts">TerminalReadResult</a></code>
- <code><a href="./src/resources/terminals.ts">TerminalCloseParams</a></code>
- <code><a href="./src/resources/terminals.ts">TerminalCloseResult</a></code>

Methods:

- <code title="workspace post /trpc/terminal.createSession">client.terminals.<a href="./src/resources/terminals.ts">create</a>({ workspaceId, command?, cwd? }) -> TerminalCreateResult</code>
- <code title="workspace get /trpc/terminal.list">client.terminals.<a href="./src/resources/terminals.ts">list</a>({ workspaceId }) -> TerminalListResult</code>
- <code title="workspace post /trpc/terminal.send">client.terminals.<a href="./src/resources/terminals.ts">send</a>({ workspaceId, terminalId, text, submit? }) -> TerminalSendResult</code>
- <code title="workspace get /trpc/terminal.snapshot">client.terminals.<a href="./src/resources/terminals.ts">read</a>({ workspaceId, terminalId, maxLines? }) -> TerminalReadResult</code>
- <code title="workspace post /trpc/terminal.killSession">client.terminals.<a href="./src/resources/terminals.ts">close</a>({ workspaceId, terminalId }) -> TerminalCloseResult</code>

# Organization

Types:

- <code><a href="./src/resources/organization.ts">OrganizationRole</a></code>
- <code><a href="./src/resources/organization.ts">Member</a></code>
- <code><a href="./src/resources/organization.ts">MemberListParams</a></code>
- <code><a href="./src/resources/organization.ts">MemberListResponse</a></code>

## Members

Methods:

- <code title="get /api/trpc/organization.members.list">client.organization.members.<a href="./src/resources/organization.ts">list</a>({ search?, limit? }) -> MemberListResponse</code>

# Telemetry

Every resource method reports one `sdk_method_called` event (method name, SDK version, runtime, success, duration) to `analytics.captureEvent` after the call settles. It is best-effort and never affects the call itself. Set `SUPERSET_TELEMETRY=0` to opt out.

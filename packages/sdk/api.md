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

- <code><a href="./src/resources/workspaces.ts">Workspace</a></code>
- <code><a href="./src/resources/workspaces.ts">HostWorkspace</a></code>
- <code><a href="./src/resources/workspaces.ts">WorkspaceListParams</a></code>
- <code><a href="./src/resources/workspaces.ts">WorkspaceListResponse</a></code>
- <code><a href="./src/resources/workspaces.ts">WorkspaceCreateParams</a></code>
- <code><a href="./src/resources/workspaces.ts">WorkspaceCreateResult</a></code>
- <code><a href="./src/resources/workspaces.ts">WorkspaceAgentLaunch</a></code>
- <code><a href="./src/resources/workspaces.ts">WorkspaceCreateAgentResult</a></code>
- <code><a href="./src/resources/workspaces.ts">WorkspaceUpdateParams</a></code>
- <code><a href="./src/resources/workspaces.ts">WorkspaceUpdateResult</a></code>
- <code><a href="./src/resources/workspaces.ts">WorkspaceDeleteResult</a></code>

Methods:

- <code title="get /api/trpc/v2Workspace.list">client.workspaces.<a href="./src/resources/workspaces.ts">list</a>({ ...params }) -> WorkspaceListResponse</code>
- <code title="host post /api/trpc/workspaces.create">client.workspaces.<a href="./src/resources/workspaces.ts">create</a>({ ...params }) -> WorkspaceCreateResult</code>
- <code title="post /api/trpc/v2Workspace.update">client.workspaces.<a href="./src/resources/workspaces.ts">update</a>(id, { ...params }) -> WorkspaceUpdateResult</code>
- <code title="host post /api/trpc/workspace.delete">client.workspaces.<a href="./src/resources/workspaces.ts">delete</a>(id, { hostId? }) -> WorkspaceDeleteResult</code>

# Projects

Types:

- <code><a href="./src/resources/projects.ts">Project</a></code>
- <code><a href="./src/resources/projects.ts">ProjectListResponse</a></code>

Methods:

- <code title="get /api/trpc/v2Project.list">client.projects.<a href="./src/resources/projects.ts">list</a>() -> ProjectListResponse</code>

# Hosts

Types:

- <code><a href="./src/resources/hosts.ts">Host</a></code>
- <code><a href="./src/resources/hosts.ts">HostListResponse</a></code>

Methods:

- <code title="get /api/trpc/host.list">client.hosts.<a href="./src/resources/hosts.ts">list</a>() -> HostListResponse</code>

# Agents

Types:

- <code><a href="./src/resources/agents.ts">HostAgentConfig</a></code>
- <code><a href="./src/resources/agents.ts">PromptTransport</a></code>
- <code><a href="./src/resources/agents.ts">AgentListParams</a></code>
- <code><a href="./src/resources/agents.ts">AgentListResponse</a></code>
- <code><a href="./src/resources/agents.ts">AgentCreateParams</a></code>
- <code><a href="./src/resources/agents.ts">AgentCreateResult</a></code>

Methods:

- <code title="host get /api/trpc/settings.agentConfigs.list">client.agents.<a href="./src/resources/agents.ts">list</a>({ hostId }) -> AgentListResponse</code>
- <code title="host post /api/trpc/agents.run">client.agents.<a href="./src/resources/agents.ts">create</a>({ workspaceId, agent, prompt, attachmentIds? }, { hostId? }) -> AgentCreateResult</code>

# Terminals

Types:

- <code><a href="./src/resources/terminals.ts">TerminalCreateParams</a></code>
- <code><a href="./src/resources/terminals.ts">TerminalCreateResult</a></code>

Methods:

- <code title="host post /api/trpc/terminal.createSession">client.terminals.<a href="./src/resources/terminals.ts">create</a>({ workspaceId, command?, cwd? }, { hostId? }) -> TerminalCreateResult</code>

# Automations

Types:

- <code><a href="./src/resources/automations.ts">Automation</a></code>
- <code><a href="./src/resources/automations.ts">AutomationSummary</a></code>
- <code><a href="./src/resources/automations.ts">AutomationListResponse</a></code>
- <code><a href="./src/resources/automations.ts">AutomationCreateParams</a></code>
- <code><a href="./src/resources/automations.ts">AutomationUpdateParams</a></code>
- <code><a href="./src/resources/automations.ts">AutomationRun</a></code>
- <code><a href="./src/resources/automations.ts">AutomationRunDispatched</a></code>
- <code><a href="./src/resources/automations.ts">AutomationLogsParams</a></code>
- <code><a href="./src/resources/automations.ts">AutomationLogsResponse</a></code>

Methods:

- <code title="get /api/trpc/automation.list">client.automations.<a href="./src/resources/automations.ts">list</a>({ name? }) -> AutomationListResponse</code>
- <code title="get /api/trpc/automation.get">client.automations.<a href="./src/resources/automations.ts">retrieve</a>(id) -> AutomationSummary</code>
- <code title="post /api/trpc/automation.create">client.automations.<a href="./src/resources/automations.ts">create</a>({ ...params }) -> Automation</code>
- <code title="post /api/trpc/automation.update">client.automations.<a href="./src/resources/automations.ts">update</a>({ ...params }) -> Automation</code>
- <code title="post /api/trpc/automation.delete">client.automations.<a href="./src/resources/automations.ts">delete</a>(id) -> void</code>
- <code title="post /api/trpc/automation.runNow">client.automations.<a href="./src/resources/automations.ts">run</a>(id) -> AutomationRunDispatched</code>
- <code title="post /api/trpc/automation.setEnabled">client.automations.<a href="./src/resources/automations.ts">pause</a>(id) -> Automation</code>
- <code title="post /api/trpc/automation.setEnabled">client.automations.<a href="./src/resources/automations.ts">resume</a>(id) -> Automation</code>
- <code title="get /api/trpc/automation.listRuns">client.automations.<a href="./src/resources/automations.ts">logs</a>(automationId, { limit? }) -> AutomationLogsResponse</code>
- <code title="get /api/trpc/automation.getPrompt">client.automations.<a href="./src/resources/automations.ts">getPrompt</a>(id) -> &#123; prompt: string &#125;</code>
- <code title="post /api/trpc/automation.setPrompt">client.automations.<a href="./src/resources/automations.ts">setPrompt</a>(id, prompt) -> Automation</code>

# Organization

Types:

- <code><a href="./src/resources/organization.ts">OrganizationRole</a></code>
- <code><a href="./src/resources/organization.ts">Member</a></code>
- <code><a href="./src/resources/organization.ts">MemberListParams</a></code>
- <code><a href="./src/resources/organization.ts">MemberListResponse</a></code>

## Members

Methods:

- <code title="get /api/trpc/organization.members.list">client.organization.members.<a href="./src/resources/organization.ts">list</a>({ search?, limit? }) -> MemberListResponse</code>

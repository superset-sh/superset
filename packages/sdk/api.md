# Tasks

Types:

- <code><a href="./src/resources/tasks.ts">Task</a></code>
- <code><a href="./src/resources/tasks.ts">TaskListItem</a></code>
- <code><a href="./src/resources/tasks.ts">TaskListParams</a></code>
- <code><a href="./src/resources/tasks.ts">TaskListResponse</a></code>
- <code><a href="./src/resources/tasks.ts">TaskCreateParams</a></code>
- <code><a href="./src/resources/tasks.ts">TaskUpdateParams</a></code>
- <code><a href="./src/resources/tasks.ts">TaskPriority</a></code>
- <code><a href="./src/resources/tasks.ts">TaskListSortBy</a></code>
- <code><a href="./src/resources/tasks.ts">TaskListSortOrder</a></code>

Methods:

- <code title="post /api/trpc/task.create">client.tasks.<a href="./src/resources/tasks.ts">create</a>({ ...params }) -> Task</code>
- <code title="get /api/trpc/task.byIdOrSlug">client.tasks.<a href="./src/resources/tasks.ts">retrieve</a>(idOrSlug) -> Task</code>
- <code title="get /api/trpc/task.list">client.tasks.<a href="./src/resources/tasks.ts">list</a>({ statusId?, priority?, assigneeId?, assigneeMe?, creatorMe?, search?, externalProjectId?, externalProjectName?, externalCycleId?, dueDateFrom?, dueDateTo?, sortBy?, sortOrder?, limit?, offset? }) -> TaskListResponse</code>
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
- <code><a href="./src/resources/workspaces.ts">WorkspaceCreateSessionParams</a></code>
- <code><a href="./src/resources/workspaces.ts">WorkspaceCreateSessionResult</a></code>
- <code><a href="./src/resources/workspaces.ts">WorkspaceAgentLaunch</a></code>
- <code><a href="./src/resources/workspaces.ts">WorkspaceCreateAgentResult</a></code>
- <code><a href="./src/resources/workspaces.ts">WorkspaceUpdateParams</a></code>
- <code><a href="./src/resources/workspaces.ts">WorkspaceUpdateResult</a></code>
- <code><a href="./src/resources/workspaces.ts">WorkspaceDeleteResult</a></code>

Methods:

- <code title="host get /api/trpc/workspace.list">client.workspaces.<a href="./src/resources/workspaces.ts">list</a>({ hostId, projectId?, projectName?, search?, tag? }) -> WorkspaceListResponse</code>
- <code title="host get /api/trpc/workspace.list">client.workspaces.<a href="./src/resources/workspaces.ts">retrieve</a>(id, { hostId }) -> Workspace | null</code>
- <code title="host post /api/trpc/workspaces.create">client.workspaces.<a href="./src/resources/workspaces.ts">create</a>({ hostId, projectId, name, branch?, pr?, baseBranch?, skipBranchPrefix?, taskId?, agents?, command?, tags? }) -> WorkspaceCreateResult</code>
- <code title="host post /api/trpc/workspaces.createSession">client.workspaces.<a href="./src/resources/workspaces.ts">createSession</a>({ hostId, name?, agents?, command? }) -> WorkspaceCreateSessionResult</code>
- <code title="host post /api/trpc/workspace.update">client.workspaces.<a href="./src/resources/workspaces.ts">update</a>(id, { name?, taskId?, tags? }, { hostId }) -> WorkspaceUpdateResult</code>
- <code title="host post /api/trpc/workspace.delete">client.workspaces.<a href="./src/resources/workspaces.ts">delete</a>(id, { hostId }) -> WorkspaceDeleteResult</code>

# Projects

Types:

- <code><a href="./src/resources/projects.ts">Project</a></code>
- <code><a href="./src/resources/projects.ts">ProjectListParams</a></code>
- <code><a href="./src/resources/projects.ts">ProjectListResponse</a></code>
- <code><a href="./src/resources/projects.ts">ProjectCreateParams</a></code>
- <code><a href="./src/resources/projects.ts">ProjectCreateResult</a></code>
- <code><a href="./src/resources/projects.ts">ProjectSetupParams</a></code>
- <code><a href="./src/resources/projects.ts">ProjectSetupResult</a></code>

Methods:

- <code title="host get /api/trpc/project.list">client.projects.<a href="./src/resources/projects.ts">list</a>({ hostId }) -> ProjectListResponse</code>
- <code title="host post /api/trpc/project.create">client.projects.<a href="./src/resources/projects.ts">create</a>({ hostId, name, clone?, parentDir?, import? }) -> ProjectCreateResult</code>
- <code title="host post /api/trpc/project.setup">client.projects.<a href="./src/resources/projects.ts">setup</a>({ hostId, projectId, parentDir?, path?, allowRelocate?, repoUrl?, name? }) -> ProjectSetupResult</code>

# Hosts

Types:

- <code><a href="./src/resources/hosts.ts">Host</a></code>
- <code><a href="./src/resources/hosts.ts">HostListResponse</a></code>
- <code><a href="./src/resources/hosts.ts">HostSetWakeCommandParams</a></code>
- <code><a href="./src/resources/hosts.ts">HostSetWakeCommandResult</a></code>

Methods:

- <code title="get /api/trpc/host.list">client.hosts.<a href="./src/resources/hosts.ts">list</a>() -> HostListResponse</code>
- <code title="post /api/trpc/host.setWakeCommand">client.hosts.<a href="./src/resources/hosts.ts">setWakeCommand</a>({ hostId, wakeCommand }) -> HostSetWakeCommandResult</code>

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
- <code title="host post /api/trpc/agents.run">client.agents.<a href="./src/resources/agents.ts">create</a>({ hostId, workspaceId, agent, prompt?, resumeSessionId?, forkSessionId?, effort?, attachmentIds? }) -> AgentCreateResult</code>

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

- <code title="host post /api/trpc/terminal.createSession">client.terminals.<a href="./src/resources/terminals.ts">create</a>({ hostId, workspaceId, command?, cwd? }) -> TerminalCreateResult</code>
- <code title="host get /api/trpc/terminal.list">client.terminals.<a href="./src/resources/terminals.ts">list</a>({ hostId, workspaceId }) -> TerminalListResult</code>
- <code title="host post /api/trpc/terminal.send">client.terminals.<a href="./src/resources/terminals.ts">send</a>({ hostId, workspaceId, terminalId, text, submit? }) -> TerminalSendResult</code>
- <code title="host get /api/trpc/terminal.snapshot">client.terminals.<a href="./src/resources/terminals.ts">read</a>({ hostId, workspaceId, terminalId, maxLines? }) -> TerminalReadResult</code>
- <code title="host post /api/trpc/terminal.killSession">client.terminals.<a href="./src/resources/terminals.ts">close</a>({ hostId, workspaceId, terminalId }) -> TerminalCloseResult</code>

# Pages

Types:

- <code><a href="./src/resources/pages.ts">Page</a></code>
- <code><a href="./src/resources/pages.ts">PageSummary</a></code>
- <code><a href="./src/resources/pages.ts">PageVisibility</a></code>
- <code><a href="./src/resources/pages.ts">PageWatchState</a></code>
- <code><a href="./src/resources/pages.ts">PageListParams</a></code>
- <code><a href="./src/resources/pages.ts">PageListResponse</a></code>
- <code><a href="./src/resources/pages.ts">PageVersion</a></code>
- <code><a href="./src/resources/pages.ts">PageVersionListResponse</a></code>
- <code><a href="./src/resources/pages.ts">PagePullParams</a></code>
- <code><a href="./src/resources/pages.ts">PagePullResult</a></code>
- <code><a href="./src/resources/pages.ts">PagePublishParams</a></code>
- <code><a href="./src/resources/pages.ts">PagePublishResult</a></code>

Methods:

- <code title="get /api/trpc/page.list">client.pages.<a href="./src/resources/pages.ts">list</a>({ workspaceId? }) -> PageListResponse</code>
- <code title="get /api/trpc/page.get">client.pages.<a href="./src/resources/pages.ts">retrieve</a>(idOrSlug) -> Page</code>
- <code title="get /api/trpc/page.versions">client.pages.<a href="./src/resources/pages.ts">versions</a>(idOrSlug) -> PageVersionListResponse</code>
- <code title="get /api/trpc/page.pull">client.pages.<a href="./src/resources/pages.ts">pull</a>(idOrSlug, { version? }) -> PagePullResult</code>
- <code title="post /api/trpc/page.publish">client.pages.<a href="./src/resources/pages.ts">publish</a>({ html, filename?, pageId?, workspaceId?, entryPath?, title?, description?, label?, visibility? }) -> PagePublishResult</code>

## Comments

Types:

- <code><a href="./src/resources/pages.ts">PageComment</a></code>
- <code><a href="./src/resources/pages.ts">PageCommentAnchor</a></code>
- <code><a href="./src/resources/pages.ts">PageCommentThread</a></code>
- <code><a href="./src/resources/pages.ts">PageCommentListParams</a></code>
- <code><a href="./src/resources/pages.ts">PageCommentListResponse</a></code>
- <code><a href="./src/resources/pages.ts">PageCommentReplyParams</a></code>
- <code><a href="./src/resources/pages.ts">PageCommentReplyResult</a></code>
- <code><a href="./src/resources/pages.ts">PageCommentResolveParams</a></code>
- <code><a href="./src/resources/pages.ts">PageCommentResolveResult</a></code>

Methods:

- <code title="get /api/trpc/pageComment.list">client.pages.comments.<a href="./src/resources/pages.ts">list</a>({ pageId, activatedOnly? }) -> PageCommentListResponse</code>
- <code title="post /api/trpc/pageComment.reply">client.pages.comments.<a href="./src/resources/pages.ts">reply</a>({ threadId, body, agentSessionId? }) -> PageCommentReplyResult</code>
- <code title="post /api/trpc/pageComment.resolve">client.pages.comments.<a href="./src/resources/pages.ts">resolve</a>({ threadId, resolved? }) -> PageCommentResolveResult</code>

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

# Telemetry

Every resource method reports one `sdk_method_called` event (method name, SDK version, runtime, success, duration) to `analytics.captureEvent` after the call settles. It is best-effort and never affects the call itself. Set `SUPERSET_TELEMETRY=0` to opt out.

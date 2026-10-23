import { router } from "../index";
import { agentToolingRouter } from "./agent-tooling";
import { agentsRouter } from "./agents";
import { attachmentsRouter } from "./attachments";
import { browserRouter } from "./browser/browser";
import { configRouter } from "./config";
import { filesystemRouter } from "./filesystem";
import { gitRouter } from "./git";
import { githubRouter } from "./github";
import { healthRouter } from "./health";
import { hostRouter } from "./host";
import { issuesRouter } from "./issues";
import { linkPreviewRouter } from "./link-preview";
import { mobileRouter } from "./mobile";
import { notificationsRouter } from "./notifications";
import { pageWatchRouter } from "./page-watch";
import { panesRouter } from "./panes";
import { portsRouter } from "./ports";
import { projectRouter } from "./project";
import { pullRequestsRouter } from "./pull-requests";
import { sandboxRouter } from "./sandbox";
import { sessionsRouter } from "./sessions";
import { settingsRouter } from "./settings";
import { sidebarRouter } from "./sidebar";
import { systemRouter } from "./system";
import { tagFoldersRouter } from "./tag-folders";
import { terminalRouter } from "./terminal";
import { terminalAgentsRouter } from "./terminal-agents";
import { usageRouter } from "./usage";
import { workspaceRouter } from "./workspace";
import { workspaceCleanupRouter } from "./workspace-cleanup";
import { workspaceCreationRouter } from "./workspace-creation";
import { workspacesRouter } from "./workspaces";

export const appRouter = router({
	agents: agentsRouter,
	sessions: sessionsRouter,
	agentTooling: agentToolingRouter,
	attachments: attachmentsRouter,
	browser: browserRouter,
	health: healthRouter,
	host: hostRouter,
	config: configRouter,
	filesystem: filesystemRouter,
	git: gitRouter,
	github: githubRouter,
	issues: issuesRouter,
	linkPreview: linkPreviewRouter,
	mobile: mobileRouter,
	notifications: notificationsRouter,
	pullRequests: pullRequestsRouter,
	project: projectRouter,
	tagFolders: tagFoldersRouter,
	pageWatch: pageWatchRouter,
	panes: panesRouter,
	ports: portsRouter,
	sandbox: sandboxRouter,
	settings: settingsRouter,
	sidebar: sidebarRouter,
	system: systemRouter,
	terminal: terminalRouter,
	terminalAgents: terminalAgentsRouter,
	usage: usageRouter,
	workspace: workspaceRouter,
	workspaces: workspacesRouter,
	workspaceCleanup: workspaceCleanupRouter,
	workspaceCreation: workspaceCreationRouter,
});

export type AppRouter = typeof appRouter;

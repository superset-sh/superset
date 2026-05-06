import { router } from "../index";
import { agentsRouter } from "./agents";
import { attachmentsRouter } from "./attachments";
import { authRouter } from "./auth";
import { chatRouter } from "./chat";
import { cloudRouter } from "./cloud";
import { configRouter } from "./config";
import { filesystemRouter } from "./filesystem";
import { gitRouter } from "./git";
import { githubRouter } from "./github";
import { healthRouter } from "./health";
import { hostRouter } from "./host";
import { issuesRouter } from "./issues";
import { notificationsRouter } from "./notifications";
import { portsRouter } from "./ports";
import { projectRouter } from "./project";
import { pullRequestsRouter } from "./pull-requests";
import { settingsRouter } from "./settings";
import { terminalRouter } from "./terminal";
import { workspaceRouter } from "./workspace";
import { workspaceCleanupRouter } from "./workspace-cleanup";
import { workspaceCreationRouter } from "./workspace-creation";
import { workspacesRouter } from "./workspaces";

export const appRouter = router({
	agents: agentsRouter,
	attachments: attachmentsRouter,
	auth: authRouter,
	health: healthRouter,
	host: hostRouter,
	chat: chatRouter,
	config: configRouter,
	filesystem: filesystemRouter,
	git: gitRouter,
	github: githubRouter,
	cloud: cloudRouter,
	issues: issuesRouter,
	notifications: notificationsRouter,
	pullRequests: pullRequestsRouter,
	project: projectRouter,
	ports: portsRouter,
	settings: settingsRouter,
	terminal: terminalRouter,
	workspace: workspaceRouter,
	workspaces: workspacesRouter,
	workspaceCleanup: workspaceCleanupRouter,
	workspaceCreation: workspaceCreationRouter,
});

export type AppRouter = typeof appRouter;

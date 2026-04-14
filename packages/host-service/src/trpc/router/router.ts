import { router } from "../index";
import { chatRouter } from "./chat";
import { cloudRouter } from "./cloud";
import { filesystemRouter } from "./filesystem";
import { gitRouter } from "./git";
import { githubRouter } from "./github";
import { healthRouter } from "./health";
import { hostRouter } from "./host";
import { projectRouter } from "./project";
import { pullRequestsRouter } from "./pull-requests";
import { terminalRouter } from "./terminal";
import { workspaceRouter } from "./workspace";
import { workspaceCleanupRouter } from "./workspace-cleanup";
import { workspaceCreationRouter } from "./workspace-creation";

export const appRouter = router({
	health: healthRouter,
	host: hostRouter,
	chat: chatRouter,
	filesystem: filesystemRouter,
	git: gitRouter,
	github: githubRouter,
	cloud: cloudRouter,
	pullRequests: pullRequestsRouter,
	project: projectRouter,
	terminal: terminalRouter,
	workspace: workspaceRouter,
	workspaceCleanup: workspaceCleanupRouter,
	workspaceCreation: workspaceCreationRouter,
});

export type AppRouter = typeof appRouter;

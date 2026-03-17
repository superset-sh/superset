import { router } from "../index";
import { cloudRouter } from "./cloud";
import { gitRouter } from "./git";
import { githubRouter } from "./github";
import { healthRouter } from "./health";
import { projectRouter } from "./project";
import { pullRequestsRouter } from "./pull-requests";
import { workspaceRouter } from "./workspace";

export const appRouter = router({
	health: healthRouter,
	git: gitRouter,
	github: githubRouter,
	cloud: cloudRouter,
	pullRequests: pullRequestsRouter,
	project: projectRouter,
	workspace: workspaceRouter,
});

export type AppRouter = typeof appRouter;

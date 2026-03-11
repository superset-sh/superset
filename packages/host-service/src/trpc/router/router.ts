import { router } from "../index";
import { cloudRouter } from "./cloud";
import { gitRouter } from "./git";
import { healthRouter } from "./health";
import { projectRouter } from "./project";
import { workspaceRouter } from "./workspace";

export const appRouter = router({
	health: healthRouter,
	git: gitRouter,
	cloud: cloudRouter,
	project: projectRouter,
	workspace: workspaceRouter,
});

export type AppRouter = typeof appRouter;

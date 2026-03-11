import { router } from "../index";
import { cloudRouter } from "./cloud";
import { gitRouter } from "./git";
import { healthRouter } from "./health";

export const appRouter = router({
	health: healthRouter,
	git: gitRouter,
	cloud: cloudRouter,
});

export type AppRouter = typeof appRouter;

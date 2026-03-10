import { router } from "../index";
import { gitRouter } from "./git";
import { healthRouter } from "./health";

export const appRouter = router({
	health: healthRouter,
	git: gitRouter,
});

export type AppRouter = typeof appRouter;

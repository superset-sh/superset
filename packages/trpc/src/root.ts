import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { adminRouter } from "./router/admin";
import { analyticsRouter } from "./router/analytics";
import { chatRouter } from "./router/chat";
import { integrationRouter } from "./router/integration";
import { organizationRouter } from "./router/organization";
import { repositoryRouter } from "./router/repository";
import { taskRouter } from "./router/task";
import { userRouter } from "./router/user";
import { createCallerFactory, createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
	admin: adminRouter,
	analytics: analyticsRouter,
	chat: chatRouter,
	integration: integrationRouter,
	organization: organizationRouter,
	repository: repositoryRouter,
	task: taskRouter,
	user: userRouter,
});

export type AppRouter = typeof appRouter;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export const createCaller = createCallerFactory(appRouter);

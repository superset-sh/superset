import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { adminRouter } from "./router/admin";
import { agentRouter } from "./router/agent";
import { analyticsRouter } from "./router/analytics";
import { apiKeyRouter } from "./router/api-key";
import { billingRouter } from "./router/billing";
import { chatRouter } from "./router/chat";
import { deviceRouter } from "./router/device";
import { integrationRouter } from "./router/integration";
import { organizationRouter } from "./router/organization";
import { projectRouter } from "./router/project";
import { projectsV2Router } from "./router/projects-v2";
import { taskRouter } from "./router/task";
import { userRouter } from "./router/user";
import { workspaceRouter } from "./router/workspace";
import { workspacesV2Router } from "./router/workspaces-v2";
import { createCallerFactory, createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
	admin: adminRouter,
	agent: agentRouter,
	apiKey: apiKeyRouter,
	analytics: analyticsRouter,
	billing: billingRouter,
	chat: chatRouter,
	device: deviceRouter,
	integration: integrationRouter,
	organization: organizationRouter,
	project: projectRouter,
	projectsV2: projectsV2Router,
	task: taskRouter,
	user: userRouter,
	workspace: workspaceRouter,
	workspacesV2: workspacesV2Router,
});

export type AppRouter = typeof appRouter;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export const createCaller = createCallerFactory(appRouter);

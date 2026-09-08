import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { adminRouter } from "./router/admin";
import { analyticsRouter } from "./router/analytics";
import { businessRouter } from "./router/analytics/business";
import { growthRouter } from "./router/analytics/growth";
import { apiKeyRouter } from "./router/api-key";
import { automationRouter } from "./router/automation";
import { billingRouter } from "./router/billing";
import { chatRouter } from "./router/chat";
import { cloudWorkspaceRouter } from "./router/cloud-workspace";
import { environmentRouter } from "./router/environment";
import { hostRouter } from "./router/host";
import { integrationRouter } from "./router/integration";
import { leaderboardRouter } from "./router/leaderboard";
import { organizationRouter } from "./router/organization";
import { pageRouter } from "./router/page";
import { pageCommentRouter } from "./router/page-comment";
import { pluginsRouter } from "./router/plugins";
import { supportRouter } from "./router/support/support";
import { taskRouter } from "./router/task";
import { teamRouter } from "./router/team";
import { userRouter } from "./router/user";
import { v2HostRouter } from "./router/v2-host";
import { v2ProjectRouter } from "./router/v2-project";
import { v2WorkspaceRouter } from "./router/v2-workspace";
import { createCallerFactory, createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
	admin: adminRouter,
	apiKey: apiKeyRouter,
	analytics: analyticsRouter,
	automation: automationRouter,
	business: businessRouter,
	billing: billingRouter,
	chat: chatRouter,
	cloudWorkspace: cloudWorkspaceRouter,
	environment: environmentRouter,
	growth: growthRouter,
	host: hostRouter,
	integration: integrationRouter,
	leaderboard: leaderboardRouter,
	organization: organizationRouter,
	page: pageRouter,
	pageComment: pageCommentRouter,
	plugins: pluginsRouter,
	support: supportRouter,
	task: taskRouter,
	team: teamRouter,
	user: userRouter,
	v2Host: v2HostRouter,
	v2Project: v2ProjectRouter,
	v2Workspace: v2WorkspaceRouter,
});

export type AppRouter = typeof appRouter;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export const createCaller = createCallerFactory(appRouter);

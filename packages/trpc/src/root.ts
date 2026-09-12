import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { adminRouter } from "./router/admin";
import { agentCredentialRouter } from "./router/agent-credential";
import { analyticsRouter } from "./router/analytics";
import { businessRouter } from "./router/analytics/business";
import { growthRouter } from "./router/analytics/growth";
import { apiKeyRouter } from "./router/api-key";
import { attachmentRouter } from "./router/attachment";
import { automationRouter } from "./router/automation";
import { billingRouter } from "./router/billing";
import { chatRouter } from "./router/chat";
import { cloudWorkspaceRouter } from "./router/cloud-workspace";
import { environmentRouter } from "./router/environment";
import { hostManagementRouter, hostRouter } from "./router/host";
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
import { v2ProjectRouter } from "./router/v2-project";
import { v2WorkspaceRouter } from "./router/v2-workspace";
import { createCallerFactory, createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
	admin: adminRouter,
	apiKey: apiKeyRouter,
	analytics: analyticsRouter,
	attachment: attachmentRouter,
	automation: automationRouter,
	business: businessRouter,
	billing: billingRouter,
	chat: chatRouter,
	cloudWorkspace: cloudWorkspaceRouter,
	environment: environmentRouter,
	growth: growthRouter,
	host: { ...hostRouter, ...hostManagementRouter },
	integration: integrationRouter,
	leaderboard: leaderboardRouter,
	organization: organizationRouter,
	page: pageRouter,
	pageComment: pageCommentRouter,
	plugins: pluginsRouter,
	support: supportRouter,
	task: taskRouter,
	team: teamRouter,
	agentCredential: agentCredentialRouter,
	user: userRouter,
	// TODO(2026-10-11): drop; desktops and phones before 1.29 call these names.
	v2Host: {
		list: hostManagementRouter.roster,
		listMembers: hostManagementRouter.listMembers,
		rename: hostManagementRouter.rename,
		delete: hostManagementRouter.delete,
		addMember: hostManagementRouter.addMember,
		removeMember: hostManagementRouter.removeMember,
		setMemberRole: hostManagementRouter.setMemberRole,
	},
	v2Project: v2ProjectRouter,
	v2Workspace: v2WorkspaceRouter,
});

export type AppRouter = typeof appRouter;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export const createCaller = createCallerFactory(appRouter);

import type { LinearClient } from "@linear/sdk";
import { taskPriorityValues } from "@superset/db/enums";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { userError } from "../../../i18n-error";
import { protectedProcedure } from "../../../trpc";
import { verifyOrgMembership } from "../utils";
import {
	createIssue,
	getIssue,
	getWorkspace,
	isLinearRateLimitError,
	issueFilterFor,
	linearStatusFilterValues,
	listIssues,
	updateIssue,
} from "./api";
import { callLinear } from "./refresh";

export async function withLinear<T>(
	userId: string,
	organizationId: string,
	fn: (client: LinearClient) => Promise<T>,
): Promise<T> {
	await verifyOrgMembership(userId, organizationId);
	let result: T | null;
	try {
		result = await callLinear(organizationId, userId, fn);
	} catch (error) {
		if (isLinearRateLimitError(error)) {
			throw userError({
				code: "TOO_MANY_REQUESTS",
				message: "Linear is limiting requests. Try again in a few minutes.",
				i18nKey: "serverError.integration.linearRateLimited",
			});
		}
		throw error;
	}
	if (result === null) {
		throw userError({
			code: "PRECONDITION_FAILED",
			message: "Connect your Linear account to use Linear here.",
			i18nKey: "serverError.integration.linearNotConnected",
		});
	}
	return result;
}

const organizationInput = z.object({ organizationId: z.uuid() });

export const linearLiveRouter = {
	workspace: protectedProcedure
		.input(organizationInput)
		.query(({ ctx, input }) =>
			withLinear(ctx.session.user.id, input.organizationId, getWorkspace),
		),

	issues: protectedProcedure
		.input(
			organizationInput.extend({
				teamId: z.string().nullish(),
				status: z.enum(linearStatusFilterValues).default("active"),
				assignee: z.string().nullish(),
				search: z.string().trim().max(200).nullish(),
				cursor: z.string().nullish(),
			}),
		)
		.query(({ ctx, input }) =>
			withLinear(ctx.session.user.id, input.organizationId, (client) =>
				listIssues(client, {
					filter: issueFilterFor(input),
					cursor: input.cursor ?? undefined,
					search: input.search || undefined,
				}),
			),
		),

	issue: protectedProcedure
		.input(organizationInput.extend({ issueId: z.string().min(1) }))
		.query(({ ctx, input }) =>
			withLinear(ctx.session.user.id, input.organizationId, (client) =>
				getIssue(client, input.issueId),
			),
		),

	updateIssue: protectedProcedure
		.input(
			organizationInput.extend({
				issueId: z.string().min(1),
				stateId: z.string().optional(),
				priority: z.enum(taskPriorityValues).optional(),
				assigneeId: z.string().nullable().optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const { organizationId, issueId, ...changes } = input;
			return withLinear(ctx.session.user.id, organizationId, (client) =>
				updateIssue(client, issueId, changes),
			);
		}),

	createIssue: protectedProcedure
		.input(
			organizationInput.extend({
				teamId: z.string().min(1),
				title: z.string().trim().min(1),
				description: z.string().optional(),
				stateId: z.string().optional(),
				priority: z.enum(taskPriorityValues).optional(),
				assigneeId: z.string().optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const { organizationId, ...issue } = input;
			return withLinear(ctx.session.user.id, organizationId, (client) =>
				createIssue(client, issue),
			);
		}),
} satisfies TRPCRouterRecord;

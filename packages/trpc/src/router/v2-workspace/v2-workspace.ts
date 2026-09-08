// Workspaces are host-owned; the `v2_workspaces` table is vestigial. These
// procedures are served as no-ops for pre-R4 host builds that still call
// them — delete the router once adoption of those builds drains.
import { db } from "@superset/db/client";
import { v2WorkspaceTypeValues } from "@superset/db/enums";
import { type SelectV2Workspace, users } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { z } from "zod";
import { env } from "../../env";
import { jwtProcedure, protectedProcedure, userError } from "../../trpc";

const resend = new Resend(env.RESEND_API_KEY);
const ACTIVATION_EVENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Emits `user.activated`, the exit condition of the Resend activation email
// automation — a user who created a real workspace stops receiving nudges.
async function exitActivationEmailCampaign(userId: string, email: string) {
	const user = await db.query.users.findFirst({
		columns: { createdAt: true },
		where: eq(users.id, userId),
	});
	const isRecentSignup =
		user && Date.now() - user.createdAt.getTime() < ACTIVATION_EVENT_WINDOW_MS;
	if (!isRecentSignup) return;

	const { error } = await resend.events.send({
		event: "user.activated",
		email,
		payload: { userId },
	});
	if (error) {
		console.error(
			`[v2Workspace.trackCreated] Failed to emit activation event for ${userId}: ${error.message}`,
		);
	}
}

export const v2WorkspaceRouter = {
	list: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				hostId: z.string().min(1).optional(),
				projectId: z.string().uuid().optional(),
				projectName: z.string().min(1).optional(),
				search: z.string().min(1).optional(),
			}),
		)
		.query(
			async (): Promise<
				Array<{
					id: string;
					name: string;
					branch: string;
					projectId: string;
					projectName: string;
					hostId: string;
					type: SelectV2Workspace["type"];
					createdAt: Date;
				}>
			> => [],
		),

	create: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				projectId: z.string().uuid(),
				name: z.string().min(1),
				branch: z.string().min(1),
				hostId: z.string().min(1),
				type: z.enum(v2WorkspaceTypeValues).default("worktree"),
				taskId: z.string().uuid().optional(),
				id: z.string().uuid().optional(),
				clientMachineId: z.string().optional(),
			}),
		)
		.mutation(
			async ({
				ctx,
				input,
			}): Promise<SelectV2Workspace & { txid: string | null }> => {
				const now = new Date();
				return {
					id: input.id ?? crypto.randomUUID(),
					organizationId: input.organizationId,
					projectId: input.projectId,
					hostId: input.hostId,
					name: input.name,
					branch: input.branch,
					type: input.type,
					createdByUserId: ctx.userId,
					taskId: input.taskId ?? null,
					createdAt: now,
					updatedAt: now,
					txid: null,
				};
			},
		),

	// Exits the Resend activation campaign, and captures nothing: the host-service
	// already emits `workspace_created` for the same workspace, so a capture here
	// double-counts it.
	trackCreated: jwtProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				organizationId: z.string().uuid(),
				projectId: z.string(),
				branch: z.string(),
				type: z.enum(v2WorkspaceTypeValues),
				hostId: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw userError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
					i18nKey: "serverError.v2Workspace.notAMemberOfThisOrganization",
				});
			}

			if (input.type !== "main" && ctx.email) {
				await exitActivationEmailCampaign(ctx.userId, ctx.email);
			}

			return { ok: true };
		}),

	setTask: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				taskId: z.string().uuid().nullable(),
			}),
		)
		.mutation(async () => ({ success: true as const, txid: null })),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).optional(),
				branch: z.string().min(1).optional(),
				hostId: z.string().min(1).optional(),
				taskId: z.string().uuid().nullable().optional(),
			}),
		)
		.mutation(
			async ({
				ctx,
				input,
			}): Promise<SelectV2Workspace & { txid: string | null }> => {
				const now = new Date();
				return {
					id: input.id,
					organizationId: ctx.activeOrganizationId ?? "",
					projectId: "",
					hostId: input.hostId ?? "",
					name: input.name ?? "",
					branch: input.branch ?? "",
					type: "worktree",
					createdByUserId: ctx.session.user.id,
					taskId: input.taskId ?? null,
					createdAt: now,
					updatedAt: now,
					txid: null,
				};
			},
		),

	getFromHost: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.query(async (): Promise<SelectV2Workspace | null> => null),

	updateNameFromHost: jwtProcedure
		.input(
			z
				.object({
					id: z.string().uuid(),
					name: z.string().min(1).optional(),
					branch: z.string().min(1).optional(),
					expectedCurrentName: z.string().optional(),
				})
				.refine((v) => v.name !== undefined || v.branch !== undefined, {
					message: "At least one of name or branch must be provided",
				}),
		)
		.mutation(async ({ input }) => ({
			id: input.id,
			name: input.name ?? "",
			branch: input.branch ?? "",
			txid: null,
		})),

	delete: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async () => ({ success: true, alreadyGone: true as const })),

	deleteMainForHost: jwtProcedure
		.input(z.object({ id: z.string().uuid(), projectId: z.string().uuid() }))
		.mutation(async () => ({ success: true, alreadyGone: true as const })),
} satisfies TRPCRouterRecord;

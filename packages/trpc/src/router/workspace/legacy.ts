// No-ops kept for host-services shipped with desktop 1.20 and earlier, which
// still call these. TODO(2026-10-24): drop once #7786 gates those builds.
import { v2WorkspaceTypeValues } from "@superset/db/enums";
import type { SelectV2Workspace } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { jwtProcedure, protectedProcedure } from "../../trpc";

export const legacyWorkspaceRouter = {
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

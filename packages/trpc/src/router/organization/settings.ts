import { db } from "@superset/db/client";
import {
	githubActorPolicyEnum,
	organizationSettings,
} from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../integration/utils";

const DEFAULTS = { githubActorPolicy: "user_or_bot" as const };

export const organizationSettingsRouter = {
	get: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			const { membership } = await verifyOrgMembership(
				ctx.session.user.id,
				input.organizationId,
			);
			const row = await db.query.organizationSettings.findFirst({
				where: eq(organizationSettings.organizationId, input.organizationId),
			});
			// Absent row = defaults; it is created on first write, not on read.
			return {
				githubActorPolicy: row?.githubActorPolicy ?? DEFAULTS.githubActorPolicy,
				canEdit: membership.role === "admin" || membership.role === "owner",
			};
		}),

	update: protectedProcedure
		.input(
			z.object({
				organizationId: z.uuid(),
				githubActorPolicy: githubActorPolicyEnum.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);
			const { organizationId, ...patch } = input;
			const [row] = await db
				.insert(organizationSettings)
				.values({ organizationId, ...DEFAULTS, ...patch })
				.onConflictDoUpdate({
					target: organizationSettings.organizationId,
					set: { ...patch, updatedAt: new Date() },
				})
				.returning();
			return {
				githubActorPolicy: row?.githubActorPolicy ?? DEFAULTS.githubActorPolicy,
			};
		}),
} satisfies TRPCRouterRecord;

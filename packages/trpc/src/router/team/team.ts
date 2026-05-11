import { db } from "@superset/db/client";
import { teams } from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { verifyOrgAdmin } from "../integration/utils";
import { requireActiveOrgId } from "../utils/active-org";

const teamKeySchema = z
	.string()
	.regex(
		/^[A-Z0-9]{3,8}$/,
		"Team identifier must be 3–8 uppercase letters or digits",
	);

const teamNameSchema = z.string().trim().min(1).max(80);

async function requireTeamInActiveOrg(teamId: string, organizationId: string) {
	const team = await db.query.teams.findFirst({
		where: and(eq(teams.id, teamId), eq(teams.organizationId, organizationId)),
		columns: { id: true },
	});
	if (!team) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Team not found in this organization",
		});
	}
}

export const teamRouter = {
	create: protectedProcedure
		.input(
			z.object({
				name: teamNameSchema,
				key: teamKeySchema,
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			await verifyOrgAdmin(ctx.session.user.id, organizationId);

			const result = await ctx.auth.api.createTeam({
				body: {
					name: input.name,
					key: input.key,
					organizationId,
				},
				headers: ctx.headers,
			});
			return result;
		}),

	update: protectedProcedure
		.input(
			z.object({
				teamId: z.string().uuid(),
				name: teamNameSchema.optional(),
				key: teamKeySchema.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			await verifyOrgAdmin(ctx.session.user.id, organizationId);
			await requireTeamInActiveOrg(input.teamId, organizationId);

			const data: { name?: string; key?: string } = {};
			if (input.name !== undefined) data.name = input.name;
			if (input.key !== undefined) data.key = input.key;

			await ctx.auth.api.updateTeam({
				body: { teamId: input.teamId, data },
				headers: ctx.headers,
			});
			return { success: true };
		}),

	delete: protectedProcedure
		.input(z.object({ teamId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			await verifyOrgAdmin(ctx.session.user.id, organizationId);
			await requireTeamInActiveOrg(input.teamId, organizationId);

			await ctx.auth.api.removeTeam({
				body: { teamId: input.teamId, organizationId },
				headers: ctx.headers,
			});
			return { success: true };
		}),

	addMember: protectedProcedure
		.input(
			z.object({
				teamId: z.string().uuid(),
				userId: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			await verifyOrgAdmin(ctx.session.user.id, organizationId);
			await requireTeamInActiveOrg(input.teamId, organizationId);

			await ctx.auth.api.addTeamMember({
				body: { teamId: input.teamId, userId: input.userId },
				headers: ctx.headers,
			});
			return { success: true };
		}),

	removeMember: protectedProcedure
		.input(
			z.object({
				teamId: z.string().uuid(),
				userId: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			const isSelf = input.userId === ctx.session.user.id;
			if (!isSelf) {
				await verifyOrgAdmin(ctx.session.user.id, organizationId);
			}
			await requireTeamInActiveOrg(input.teamId, organizationId);

			// The ≥1-team invariant is enforced by the beforeRemoveTeamMember
			// org hook, so any caller (this procedure, direct authClient, future
			// API surfaces) gets the same guarantee.
			await ctx.auth.api.removeTeamMember({
				body: { teamId: input.teamId, userId: input.userId },
				headers: ctx.headers,
			});
			return { success: true };
		}),
} satisfies TRPCRouterRecord;

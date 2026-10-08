import { db, dbWs } from "@superset/db/client";
import { taskSequences, tasks, teams } from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, userError } from "../../trpc";
import { verifyOrgAdmin } from "../integration/utils";
import { requireActiveOrgId } from "../utils/active-org";

async function requireTeamInActiveOrg(teamId: string, organizationId: string) {
	const team = await db.query.teams.findFirst({
		where: and(eq(teams.id, teamId), eq(teams.organizationId, organizationId)),
		columns: { id: true },
	});
	if (!team) {
		throw userError({
			code: "NOT_FOUND",
			message: "Team not found in this organization",
			i18nKey: "serverError.team.teamNotFoundInThisOrganization",
		});
	}
}

export const teamRouter = {
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

	setTaskKey: protectedProcedure
		.input(z.object({ teamId: z.string().uuid(), key: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			await verifyOrgAdmin(ctx.session.user.id, organizationId);
			await requireTeamInActiveOrg(input.teamId, organizationId);

			const key = input.key.trim().toUpperCase();
			if (!/^[A-Z][A-Z0-9]{0,4}$/.test(key)) {
				throw userError({
					code: "BAD_REQUEST",
					message:
						"A task key is 1 to 5 letters or numbers and starts with a letter.",
					i18nKey: "serverError.team.taskKeyInvalid",
				});
			}

			return dbWs.transaction(async (tx) => {
				const [otherTeam] = await tx
					.select({ teamId: taskSequences.teamId })
					.from(taskSequences)
					.where(
						and(
							eq(taskSequences.organizationId, organizationId),
							eq(taskSequences.key, key),
							ne(taskSequences.teamId, input.teamId),
						),
					)
					.limit(1);
				const [otherTask] = otherTeam
					? []
					: await tx
							.select({ id: tasks.id })
							.from(tasks)
							.where(
								and(
									eq(tasks.organizationId, organizationId),
									ne(tasks.teamId, input.teamId),
									sql`${tasks.slug} ~ ${`^${key}-[0-9]+$`}`,
								),
							)
							.limit(1);
				if (otherTeam || otherTask) {
					throw userError({
						code: "CONFLICT",
						message: `${key} is already used for tasks in this organization.`,
						i18nKey: "serverError.team.taskKeyTaken",
						params: { key },
					});
				}

				await tx
					.insert(taskSequences)
					.values({ teamId: input.teamId, organizationId, key })
					.onConflictDoUpdate({
						target: taskSequences.teamId,
						set: { key },
					});
				await tx
					.update(tasks)
					.set({ slug: sql`${key} || '-' || ${tasks.number}` })
					.where(eq(tasks.teamId, input.teamId));

				return { key, txid: await getCurrentTxid(tx) };
			});
		}),
} satisfies TRPCRouterRecord;

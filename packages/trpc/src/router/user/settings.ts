import { db } from "@superset/db/client";
import { gitCommitAuthorModeEnum, userSettings } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { githubConfigOf } from "../integration/github/user-connection";

const DEFAULTS = {
	gitCommitAuthorMode: "you_only" as const,
	gitCommitEmail: null as string | null,
};

export const userSettingsRouter = {
	get: protectedProcedure.query(async ({ ctx }) => {
		const row = await db.query.userSettings.findFirst({
			where: eq(userSettings.userId, ctx.session.user.id),
		});
		// Absent row = defaults; it is created on first write, not on read.
		return {
			gitCommitAuthorMode:
				row?.gitCommitAuthorMode ?? DEFAULTS.gitCommitAuthorMode,
			gitCommitEmail: row?.gitCommitEmail ?? DEFAULTS.gitCommitEmail,
		};
	}),

	update: protectedProcedure
		.input(
			z.object({
				gitCommitAuthorMode: gitCommitAuthorModeEnum.optional(),
				// Null resets to automatic (the account email).
				gitCommitEmail: z.string().email().max(320).nullish(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const patch = {
				...(input.gitCommitAuthorMode !== undefined
					? { gitCommitAuthorMode: input.gitCommitAuthorMode }
					: {}),
				...(input.gitCommitEmail !== undefined
					? { gitCommitEmail: input.gitCommitEmail }
					: {}),
			};
			const [row] = await db
				.insert(userSettings)
				.values({ userId: ctx.session.user.id, ...DEFAULTS, ...patch })
				.onConflictDoUpdate({
					target: userSettings.userId,
					set: { ...patch, updatedAt: new Date() },
				})
				.returning();
			return {
				gitCommitAuthorMode:
					row?.gitCommitAuthorMode ?? DEFAULTS.gitCommitAuthorMode,
				gitCommitEmail: row?.gitCommitEmail ?? DEFAULTS.gitCommitEmail,
			};
		}),

	/**
	 * Addresses to offer for git commits: the account email, plus GitHub's
	 * noreply for the connected account. The noreply is constructed, not
	 * fetched — `{id}+{login}@users.noreply.github.com` is GitHub's documented
	 * shape — so this works without the App holding an email-read permission,
	 * and it is the address that keeps attribution linked when the person's
	 * real email is private.
	 */
	gitEmailOptions: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			const options: Array<{ value: string; label: string }> = [
				{
					value: ctx.session.user.email,
					label: `${ctx.session.user.email} (account)`,
				},
			];
			const connection = await db.query.integrationConnections.findFirst({
				where: (t, { and, eq: equals, isNull }) =>
					and(
						equals(t.organizationId, input.organizationId),
						equals(t.provider, "github"),
						equals(t.connectedByUserId, ctx.session.user.id),
						isNull(t.disconnectedAt),
					),
			});
			const github = githubConfigOf(connection?.config);
			if (github) {
				options.push({
					value: `${github.githubUserId}+${github.login}@users.noreply.github.com`,
					label: `${github.login}'s GitHub noreply`,
				});
			}
			return options;
		}),
} satisfies TRPCRouterRecord;

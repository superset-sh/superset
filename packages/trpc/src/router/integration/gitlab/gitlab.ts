import { db } from "@superset/db/client";
import {
	type GitLabConfig,
	integrationConnections,
	pullRequests,
	repositories,
} from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { Client } from "@upstash/qstash";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../../env";
import { protectedProcedure } from "../../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../utils";

const qstash = new Client({ token: env.QSTASH_TOKEN });

/** Finds the org's GitLab connection id (active or not), or null. */
async function findGitlabConnectionId(
	organizationId: string,
): Promise<string | null> {
	const connection = await db.query.integrationConnections.findFirst({
		where: and(
			eq(integrationConnections.organizationId, organizationId),
			eq(integrationConnections.provider, "gitlab"),
		),
		columns: { id: true },
	});
	return connection?.id ?? null;
}

export const gitlabRouter = {
	getConnection: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const connection = await db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.organizationId, input.organizationId),
					eq(integrationConnections.provider, "gitlab"),
				),
				columns: {
					id: true,
					externalOrgId: true,
					externalOrgName: true,
					config: true,
					disconnectedAt: true,
					disconnectReason: true,
				},
			});
			if (!connection) return null;
			return {
				groupId: connection.externalOrgId,
				groupName: connection.externalOrgName,
				config: connection.config as GitLabConfig | null,
				needsReconnect: !!connection.disconnectedAt,
				disconnectReason: connection.disconnectReason,
			};
		}),

	disconnect: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			// Deleting the connection cascades to its repositories (connectionId FK)
			// and their pull_requests (repositoryId FK), so no manual cleanup needed.
			const result = await db
				.delete(integrationConnections)
				.where(
					and(
						eq(integrationConnections.organizationId, input.organizationId),
						eq(integrationConnections.provider, "gitlab"),
					),
				)
				.returning({ id: integrationConnections.id });

			if (result.length === 0) {
				return { success: false, error: "No connection found" };
			}

			return { success: true };
		}),

	triggerSync: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const connectionId = await findGitlabConnectionId(input.organizationId);
			if (!connectionId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "GitLab connection not found",
				});
			}

			const syncUrl = `${env.NEXT_PUBLIC_API_URL}/api/gitlab/jobs/initial-sync`;
			const syncBody = {
				connectionId,
				organizationId: input.organizationId,
			};

			// In development, call the sync endpoint directly (QStash can't reach localhost).
			if (env.NODE_ENV === "development") {
				fetch(syncUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(syncBody),
				}).catch((error) => {
					console.error("[gitlab/triggerSync] Dev sync failed:", error);
				});
			} else {
				await qstash.publishJSON({ url: syncUrl, body: syncBody, retries: 3 });
			}

			return { success: true };
		}),

	listRepositories: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			return db.query.repositories.findMany({
				where: and(
					eq(repositories.organizationId, input.organizationId),
					eq(repositories.provider, "gitlab"),
				),
				orderBy: [desc(repositories.updatedAt)],
			});
		}),

	listPullRequests: protectedProcedure
		.input(
			z.object({
				organizationId: z.uuid(),
				repositoryId: z.uuid().optional(),
				state: z.enum(["open", "closed", "all"]).optional().default("open"),
			}),
		)
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const conditions = [
				eq(pullRequests.organizationId, input.organizationId),
				eq(pullRequests.provider, "gitlab"),
			];
			if (input.repositoryId) {
				conditions.push(eq(pullRequests.repositoryId, input.repositoryId));
			}
			if (input.state !== "all") {
				conditions.push(eq(pullRequests.state, input.state));
			}

			return db
				.select({
					id: pullRequests.id,
					number: pullRequests.number,
					title: pullRequests.title,
					url: pullRequests.url,
					state: pullRequests.state,
					isDraft: pullRequests.isDraft,
					authorLogin: pullRequests.authorLogin,
					authorAvatarUrl: pullRequests.authorAvatarUrl,
					headBranch: pullRequests.headBranch,
					baseBranch: pullRequests.baseBranch,
					reviewStateJson: pullRequests.reviewStateJson,
					checksStatus: pullRequests.checksStatus,
					checks: pullRequests.checks,
					mergedAt: pullRequests.mergedAt,
					closedAt: pullRequests.closedAt,
					updatedAt: pullRequests.updatedAt,
					repository: {
						id: repositories.id,
						fullName: repositories.fullName,
						owner: repositories.owner,
						name: repositories.name,
					},
				})
				.from(pullRequests)
				.innerJoin(repositories, eq(pullRequests.repositoryId, repositories.id))
				.where(and(...conditions))
				.orderBy(desc(pullRequests.updatedAt))
				.limit(100);
		}),

	getStats: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const repos = await db.query.repositories.findMany({
				where: and(
					eq(repositories.organizationId, input.organizationId),
					eq(repositories.provider, "gitlab"),
				),
				columns: { id: true },
			});

			const empty = {
				repositoryCount: 0,
				openPullRequestCount: 0,
				pendingChecksCount: 0,
				failedChecksCount: 0,
			};
			if (repos.length === 0) return empty;

			const openPrs = await db.query.pullRequests.findMany({
				where: and(
					eq(pullRequests.organizationId, input.organizationId),
					eq(pullRequests.provider, "gitlab"),
					inArray(
						pullRequests.repositoryId,
						repos.map((r) => r.id),
					),
					eq(pullRequests.state, "open"),
				),
				columns: { id: true, checksStatus: true },
			});

			return {
				repositoryCount: repos.length,
				openPullRequestCount: openPrs.length,
				pendingChecksCount: openPrs.filter((p) => p.checksStatus === "pending")
					.length,
				failedChecksCount: openPrs.filter((p) => p.checksStatus === "failure")
					.length,
			};
		}),
} satisfies TRPCRouterRecord;

import { db } from "@superset/db/client";
import {
	githubInstallations,
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

export const githubRouter = {
	getInstallation: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const installation = await db.query.githubInstallations.findFirst({
				where: eq(githubInstallations.organizationId, input.organizationId),
				columns: {
					id: true,
					accountLogin: true,
					accountType: true,
					suspended: true,
					lastSyncedAt: true,
					createdAt: true,
				},
			});

			return installation ?? null;
		}),

	disconnect: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			const result = await db
				.delete(githubInstallations)
				.where(eq(githubInstallations.organizationId, input.organizationId))
				.returning({ id: githubInstallations.id });

			if (result.length === 0) {
				return { success: false, error: "No installation found" };
			}

			return { success: true };
		}),

	triggerSync: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const installation = await db.query.githubInstallations.findFirst({
				where: eq(githubInstallations.organizationId, input.organizationId),
				columns: { id: true },
			});

			if (!installation) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "GitHub installation not found",
				});
			}

			const syncUrl = `${env.NEXT_PUBLIC_API_URL}/api/github/jobs/initial-sync`;
			const syncBody = {
				installationDbId: installation.id,
				organizationId: input.organizationId,
			};

			// In development, call the sync endpoint directly (QStash can't reach localhost)
			if (env.NODE_ENV === "development") {
				fetch(syncUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(syncBody),
				}).catch((error) => {
					console.error("[github/triggerSync] Dev sync failed:", error);
				});
			} else {
				await qstash.publishJSON({
					url: syncUrl,
					body: syncBody,
					retries: 3,
				});
			}

			return { success: true };
		}),

	listRepositories: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			// Reads the generic tables (GitHub rows mirrored there via dual-write).
			return db.query.repositories.findMany({
				where: and(
					eq(repositories.organizationId, input.organizationId),
					eq(repositories.provider, "github"),
				),
				orderBy: [desc(repositories.updatedAt)],
			});
		}),

	listPullRequests: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				repositoryId: z.string().uuid().optional(),
				state: z.enum(["open", "closed", "all"]).optional().default("open"),
			}),
		)
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const conditions = [
				eq(pullRequests.organizationId, input.organizationId),
				eq(pullRequests.provider, "github"),
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
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const repos = await db.query.repositories.findMany({
				where: and(
					eq(repositories.organizationId, input.organizationId),
					eq(repositories.provider, "github"),
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
					eq(pullRequests.provider, "github"),
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

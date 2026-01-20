import { db } from "@superset/db/client";
import {
	githubInstallations,
	githubPullRequests,
	githubRepositories,
} from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "./utils";

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

	listRepositories: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const installation = await db.query.githubInstallations.findFirst({
				where: eq(githubInstallations.organizationId, input.organizationId),
				columns: { id: true },
			});

			if (!installation) {
				return [];
			}

			return db.query.githubRepositories.findMany({
				where: eq(githubRepositories.installationId, installation.id),
				orderBy: [desc(githubRepositories.updatedAt)],
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

			const installation = await db.query.githubInstallations.findFirst({
				where: eq(githubInstallations.organizationId, input.organizationId),
				columns: { id: true },
			});

			if (!installation) {
				return [];
			}

			// Get repository IDs for this installation
			const repos = await db.query.githubRepositories.findMany({
				where: input.repositoryId
					? and(
							eq(githubRepositories.installationId, installation.id),
							eq(githubRepositories.id, input.repositoryId),
						)
					: eq(githubRepositories.installationId, installation.id),
				columns: { id: true },
			});

			if (repos.length === 0) {
				return [];
			}

			const repoIds = repos.map((r) => r.id);

			// Build query conditions
			const conditions = [];
			if (repoIds.length > 0) {
				conditions.push(inArray(githubPullRequests.repositoryId, repoIds));
			}

			if (input.state !== "all") {
				conditions.push(eq(githubPullRequests.state, input.state));
			}

			return db.query.githubPullRequests.findMany({
				where: conditions.length > 0 ? and(...conditions) : undefined,
				with: {
					repository: {
						columns: {
							id: true,
							fullName: true,
							owner: true,
							name: true,
						},
					},
				},
				orderBy: [desc(githubPullRequests.updatedAt)],
				limit: 100,
			});
		}),

	getStats: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const installation = await db.query.githubInstallations.findFirst({
				where: eq(githubInstallations.organizationId, input.organizationId),
				columns: { id: true },
			});

			if (!installation) {
				return {
					repositoryCount: 0,
					openPullRequestCount: 0,
					pendingChecksCount: 0,
					failedChecksCount: 0,
				};
			}

			const repos = await db.query.githubRepositories.findMany({
				where: eq(githubRepositories.installationId, installation.id),
				columns: { id: true },
			});

			if (repos.length === 0) {
				return {
					repositoryCount: 0,
					openPullRequestCount: 0,
					pendingChecksCount: 0,
					failedChecksCount: 0,
				};
			}

			const repoIds = repos.map((r) => r.id);

			// Get open PRs
			const openPrs = await db.query.githubPullRequests.findMany({
				where: and(
					eq(githubPullRequests.state, "open"),
					inArray(githubPullRequests.repositoryId, repoIds),
				),
				columns: {
					id: true,
					checksStatus: true,
				},
			});

			const pendingChecksCount = openPrs.filter(
				(pr) => pr.checksStatus === "pending",
			).length;
			const failedChecksCount = openPrs.filter(
				(pr) => pr.checksStatus === "failure",
			).length;

			return {
				repositoryCount: repos.length,
				openPullRequestCount: openPrs.length,
				pendingChecksCount,
				failedChecksCount,
			};
		}),
} satisfies TRPCRouterRecord;

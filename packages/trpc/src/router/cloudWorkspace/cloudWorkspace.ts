import { db, dbWs } from "@superset/db/client";
import { cloudWorkspaces, repositories } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";

export const cloudWorkspaceRouter = {
	all: protectedProcedure.query(() => {
		return db.query.cloudWorkspaces.findMany({
			where: isNull(cloudWorkspaces.deletedAt),
			orderBy: desc(cloudWorkspaces.createdAt),
			with: {
				organization: true,
				repository: true,
			},
		});
	}),

	byOrganization: protectedProcedure
		.input(z.string().uuid())
		.query(({ input }) => {
			return db.query.cloudWorkspaces.findMany({
				where: and(
					eq(cloudWorkspaces.organizationId, input),
					isNull(cloudWorkspaces.deletedAt),
				),
				orderBy: desc(cloudWorkspaces.createdAt),
				with: {
					repository: true,
				},
			});
		}),

	byId: protectedProcedure.input(z.string().uuid()).query(({ input }) => {
		return db.query.cloudWorkspaces.findFirst({
			where: eq(cloudWorkspaces.id, input),
			with: {
				organization: true,
				repository: true,
			},
		});
	}),

	findMatching: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				repoOwner: z.string().min(1),
				repoName: z.string().min(1),
			}),
		)
		.query(async ({ input }) => {
			const { organizationId, repoOwner, repoName } = input;

			const repository = await db.query.repositories.findFirst({
				where: and(
					eq(repositories.organizationId, organizationId),
					eq(repositories.repoOwner, repoOwner),
					eq(repositories.repoName, repoName),
				),
			});

			if (!repository) {
				return [];
			}

			return db.query.cloudWorkspaces.findMany({
				where: and(
					eq(cloudWorkspaces.repositoryId, repository.id),
					isNull(cloudWorkspaces.deletedAt),
				),
				orderBy: desc(cloudWorkspaces.createdAt),
			});
		}),

	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				repoOwner: z.string().min(1),
				repoName: z.string().min(1),
				repoUrl: z.string().url(),
				name: z.string().min(1),
				branch: z.string().min(1),
			}),
		)
		.mutation(async ({ input }) => {
			const { organizationId, repoOwner, repoName, repoUrl, name, branch } =
				input;

			return dbWs.transaction(async (tx) => {
				let repository = await tx.query.repositories.findFirst({
					where: and(
						eq(repositories.organizationId, organizationId),
						eq(repositories.repoOwner, repoOwner),
						eq(repositories.repoName, repoName),
					),
				});

				if (!repository) {
					const slug = `${repoOwner}-${repoName}`.toLowerCase();
					const [newRepo] = await tx
						.insert(repositories)
						.values({
							organizationId,
							name: repoName,
							slug,
							repoUrl,
							repoOwner,
							repoName,
							defaultBranch: "main",
						})
						.returning();

					if (!newRepo) {
						throw new Error("Failed to create repository");
					}
					repository = newRepo;
				}

				const [cloudWorkspace] = await tx
					.insert(cloudWorkspaces)
					.values({
						organizationId,
						repositoryId: repository.id,
						name,
						branch,
					})
					.returning();

				return {
					cloudWorkspace,
					repository,
				};
			});
		}),

	delete: protectedProcedure
		.input(z.string().uuid())
		.mutation(async ({ input }) => {
			await dbWs
				.update(cloudWorkspaces)
				.set({ deletedAt: new Date() })
				.where(eq(cloudWorkspaces.id, input));

			return { success: true };
		}),
} satisfies TRPCRouterRecord;

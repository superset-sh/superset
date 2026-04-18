import { dbWs } from "@superset/db/client";
import {
	githubRepositories,
	organizations,
	v2Projects,
} from "@superset/db/schema";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { jwtProcedure, protectedProcedure } from "../../trpc";
import {
	requireActiveOrgId,
	requireActiveOrgMembership,
} from "../utils/active-org";
import {
	requireOrgResourceAccess,
	requireOrgScopedResource,
} from "../utils/org-resource-access";

async function getScopedGithubRepository(
	organizationId: string,
	githubRepositoryId: string,
) {
	return requireOrgScopedResource(
		() =>
			dbWs.query.githubRepositories.findFirst({
				columns: {
					id: true,
					organizationId: true,
				},
				where: eq(githubRepositories.id, githubRepositoryId),
			}),
		{
			code: "BAD_REQUEST",
			message: "GitHub repository not found in this organization",
			organizationId,
		},
	);
}

async function getScopedProject(organizationId: string, projectId: string) {
	return requireOrgScopedResource(
		() =>
			dbWs.query.v2Projects.findFirst({
				columns: {
					id: true,
					organizationId: true,
				},
				where: eq(v2Projects.id, projectId),
			}),
		{
			message: "Project not found in this organization",
			organizationId,
		},
	);
}

async function getProjectAccess(
	userId: string,
	projectId: string,
	options?: {
		access?: "admin" | "member";
		organizationId?: string;
	},
) {
	return requireOrgResourceAccess(
		userId,
		() =>
			dbWs.query.v2Projects.findFirst({
				columns: {
					id: true,
					organizationId: true,
				},
				where: eq(v2Projects.id, projectId),
			}),
		{
			access: options?.access,
			message: "Project not found",
			organizationId: options?.organizationId,
		},
	);
}

export const v2ProjectRouter = {
	get: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.query(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}
			const row = await requireOrgScopedResource(
				() =>
					dbWs.query.v2Projects.findFirst({
						where: eq(v2Projects.id, input.id),
						with: { githubRepository: true },
					}),
				{
					message: "Project not found",
					organizationId: input.organizationId,
				},
			);
			const repoCloneUrl = row.githubRepository
				? `https://github.com/${row.githubRepository.fullName}.git`
				: null;
			return { ...row, repoCloneUrl };
		}),

	findByRemote: jwtProcedure
		.input(z.object({ repoCloneUrl: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const parsed = parseGitHubRemote(input.repoCloneUrl);
			if (!parsed || ctx.organizationIds.length === 0) {
				return { candidates: [] };
			}
			// GitHub slugs are case-insensitive (github.com/Foo/Bar and
			// github.com/foo/bar point to the same repo). Local git remotes
			// preserve whatever casing was typed at clone time. Compare in lower
			// case so we still match.
			const fullNameLower = `${parsed.owner}/${parsed.name}`.toLowerCase();

			const rows = await dbWs
				.select({
					id: v2Projects.id,
					name: v2Projects.name,
					slug: v2Projects.slug,
					organizationId: v2Projects.organizationId,
					organizationName: organizations.name,
				})
				.from(v2Projects)
				.innerJoin(
					githubRepositories,
					eq(v2Projects.githubRepositoryId, githubRepositories.id),
				)
				.innerJoin(
					organizations,
					eq(v2Projects.organizationId, organizations.id),
				)
				.where(
					and(
						eq(sql`lower(${githubRepositories.fullName})`, fullNameLower),
						inArray(v2Projects.organizationId, ctx.organizationIds),
					),
				);

			return { candidates: rows };
		}),

	create: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: z.string().min(1),
				slug: z.string().min(1),
				repoCloneUrl: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}
			const parsed = parseGitHubRemote(input.repoCloneUrl);
			if (!parsed) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Could not parse GitHub remote URL",
				});
			}
			const fullName = `${parsed.owner}/${parsed.name}`;
			const fullNameLower = fullName.toLowerCase();

			// Case-insensitive match — see findByRemote note.
			const repo = await dbWs.query.githubRepositories.findFirst({
				columns: { id: true },
				where: and(
					eq(sql`lower(${githubRepositories.fullName})`, fullNameLower),
					eq(githubRepositories.organizationId, input.organizationId),
				),
			});
			if (!repo) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `GitHub repository ${fullName} is not installed in this organization`,
				});
			}

			const [project] = await dbWs
				.insert(v2Projects)
				.values({
					organizationId: input.organizationId,
					name: input.name,
					slug: input.slug,
					githubRepositoryId: repo.id,
				})
				.returning();
			if (!project) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create project",
				});
			}
			return project;
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).optional(),
				slug: z.string().min(1).optional(),
				githubRepositoryId: z.string().uuid().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(
				ctx.session,
				"No active organization",
			);
			const project = await getProjectAccess(ctx.session.user.id, input.id, {
				organizationId,
			});

			if (input.githubRepositoryId) {
				await getScopedGithubRepository(
					project.organizationId,
					input.githubRepositoryId,
				);
			}

			const data = {
				githubRepositoryId: input.githubRepositoryId,
				name: input.name,
				slug: input.slug,
			};
			if (
				Object.keys(data).every(
					(k) => data[k as keyof typeof data] === undefined,
				)
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No fields to update",
				});
			}
			const [updated] = await dbWs
				.update(v2Projects)
				.set(data)
				.where(eq(v2Projects.id, project.id))
				.returning();
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found",
				});
			}
			return updated;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(
				ctx.session,
				"No active organization",
			);
			const project = await getScopedProject(organizationId, input.id);
			await dbWs.delete(v2Projects).where(eq(v2Projects.id, project.id));
			return { success: true };
		}),
} satisfies TRPCRouterRecord;

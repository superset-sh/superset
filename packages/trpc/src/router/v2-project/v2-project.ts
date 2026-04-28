import { dbWs } from "@superset/db/client";
import {
	githubRepositories,
	organizations,
	v2Projects,
} from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { del } from "@vercel/blob";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { fetchAndStoreGitHubAvatar } from "../../lib/github-avatar";
import { generateImagePathname, uploadImage } from "../../lib/upload";
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
			return row;
		}),

	findByGitHubRemote: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				repoCloneUrl: z.string().min(1),
			}),
		)
		.query(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}
			const parsed = parseGitHubRemote(input.repoCloneUrl);
			if (!parsed) return { candidates: [] };
			// GitHub slugs are case-insensitive; parseGitHubRemote returns a
			// canonical https URL. Compare lower-cased on both sides.
			const canonicalUrl = parsed.url.toLowerCase();

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
					organizations,
					eq(v2Projects.organizationId, organizations.id),
				)
				.where(
					and(
						eq(sql`lower(${v2Projects.repoCloneUrl})`, canonicalUrl),
						eq(v2Projects.organizationId, input.organizationId),
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
				// Optional — empty-mode and local-only imports have no
				// remote yet. When provided we store the canonical https
				// URL and try to link a matching github_repositories row.
				repoCloneUrl: z.string().min(1).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}

			let canonicalUrl: string | null = null;
			let linkedRepoId: string | null = null;
			let githubOwner: string | null = null;
			if (input.repoCloneUrl) {
				const parsed = parseGitHubRemote(input.repoCloneUrl);
				if (!parsed) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Could not parse GitHub remote URL",
					});
				}
				canonicalUrl = parsed.url;
				githubOwner = parsed.owner;
				const fullNameLower = `${parsed.owner}/${parsed.name}`.toLowerCase();
				const repo = await dbWs.query.githubRepositories.findFirst({
					columns: { id: true },
					where: and(
						eq(sql`lower(${githubRepositories.fullName})`, fullNameLower),
						eq(githubRepositories.organizationId, input.organizationId),
					),
				});
				linkedRepoId = repo?.id ?? null;
			}

			const [project] = await dbWs
				.insert(v2Projects)
				.values({
					organizationId: input.organizationId,
					name: input.name,
					slug: input.slug,
					repoCloneUrl: canonicalUrl,
					githubRepositoryId: linkedRepoId,
				})
				.returning();
			if (!project) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create project",
				});
			}

			if (githubOwner) {
				const iconUrl = await fetchAndStoreGitHubAvatar({
					owner: githubOwner,
					pathnamePrefix: `v2-project/${project.id}/icon`,
					existingUrl: null,
				});
				if (iconUrl) {
					const [withIcon] = await dbWs
						.update(v2Projects)
						.set({ iconUrl })
						.where(eq(v2Projects.id, project.id))
						.returning();
					if (withIcon) return withIcon;
				}
			}

			return project;
		}),

	linkRepoCloneUrl: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
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
			const canonicalUrl = parsed.url;

			await requireOrgScopedResource(
				() =>
					dbWs.query.v2Projects.findFirst({
						columns: { id: true, organizationId: true },
						where: eq(v2Projects.id, input.id),
					}),
				{
					message: "Project not found",
					organizationId: input.organizationId,
				},
			);

			const fullNameLower = `${parsed.owner}/${parsed.name}`.toLowerCase();
			const repo = await dbWs.query.githubRepositories.findFirst({
				columns: { id: true },
				where: and(
					eq(sql`lower(${githubRepositories.fullName})`, fullNameLower),
					eq(githubRepositories.organizationId, input.organizationId),
				),
			});

			const [updated] = await dbWs
				.update(v2Projects)
				.set({
					repoCloneUrl: canonicalUrl,
					githubRepositoryId: repo?.id ?? null,
				})
				.where(
					and(
						eq(v2Projects.id, input.id),
						eq(v2Projects.organizationId, input.organizationId),
						isNull(v2Projects.repoCloneUrl),
					),
				)
				.returning();
			if (!updated) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "Project already has a linked repository",
				});
			}

			if (updated.iconUrl == null) {
				const iconUrl = await fetchAndStoreGitHubAvatar({
					owner: parsed.owner,
					pathnamePrefix: `v2-project/${updated.id}/icon`,
					existingUrl: null,
				});
				if (iconUrl) {
					const [withIcon] = await dbWs
						.update(v2Projects)
						.set({ iconUrl })
						.where(
							and(eq(v2Projects.id, updated.id), isNull(v2Projects.iconUrl)),
						)
						.returning();
					if (withIcon) return withIcon;
				}
			}

			return updated;
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).optional(),
				slug: z.string().min(1).optional(),
				githubRepositoryId: z.string().uuid().nullable().optional(),
				repoCloneUrl: z.string().min(1).nullable().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const project = await getProjectAccess(ctx.session.user.id, input.id, {
				organizationId,
			});

			if (input.githubRepositoryId) {
				await getScopedGithubRepository(
					project.organizationId,
					input.githubRepositoryId,
				);
			}

			let canonicalRepoCloneUrl: string | null | undefined;
			let resolvedGithubRepositoryId: string | null | undefined =
				input.githubRepositoryId;
			if (input.repoCloneUrl === null) {
				canonicalRepoCloneUrl = null;
				resolvedGithubRepositoryId = null;
			} else if (input.repoCloneUrl !== undefined) {
				const parsed = parseGitHubRemote(input.repoCloneUrl);
				if (!parsed) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Could not parse GitHub remote URL",
					});
				}
				canonicalRepoCloneUrl = parsed.url;
				if (input.githubRepositoryId === undefined) {
					const fullNameLower = `${parsed.owner}/${parsed.name}`.toLowerCase();
					const repo = await dbWs.query.githubRepositories.findFirst({
						columns: { id: true },
						where: and(
							eq(sql`lower(${githubRepositories.fullName})`, fullNameLower),
							eq(githubRepositories.organizationId, project.organizationId),
						),
					});
					resolvedGithubRepositoryId = repo?.id ?? null;
				}
			}

			const data = {
				githubRepositoryId: resolvedGithubRepositoryId,
				name: input.name,
				slug: input.slug,
				repoCloneUrl: canonicalRepoCloneUrl,
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
			const result = await dbWs.transaction(async (tx) => {
				const [updated] = await tx
					.update(v2Projects)
					.set(data)
					.where(eq(v2Projects.id, project.id))
					.returning();

				const txid = await getCurrentTxid(tx);

				return { updated, txid };
			});
			const { updated, txid } = result;
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found",
				});
			}
			return { ...updated, txid };
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(
				ctx,
				"No active organization",
			);
			const project = await getScopedProject(organizationId, input.id);
			await dbWs.delete(v2Projects).where(eq(v2Projects.id, project.id));
			return { success: true };
		}),

	uploadIcon: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				fileData: z.string(),
				fileName: z.string(),
				mimeType: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			await getProjectAccess(ctx.session.user.id, input.id, {
				organizationId,
			});

			const existing = await dbWs.query.v2Projects.findFirst({
				columns: { iconUrl: true },
				where: eq(v2Projects.id, input.id),
			});

			const pathname = generateImagePathname({
				prefix: `v2-project/${input.id}/icon`,
				mimeType: input.mimeType,
			});

			const url = await uploadImage({
				fileData: input.fileData,
				mimeType: input.mimeType,
				pathname,
				existingUrl: existing?.iconUrl ?? null,
			});

			const { updated, txid } = await dbWs.transaction(async (tx) => {
				const [row] = await tx
					.update(v2Projects)
					.set({ iconUrl: url })
					.where(eq(v2Projects.id, input.id))
					.returning();
				const currentTxid = await getCurrentTxid(tx);
				return { updated: row, txid: currentTxid };
			});

			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found",
				});
			}
			return { ...updated, txid };
		}),

	resetIconToGitHub: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			await getProjectAccess(ctx.session.user.id, input.id, {
				organizationId,
			});

			const existing = await dbWs.query.v2Projects.findFirst({
				columns: { iconUrl: true, repoCloneUrl: true },
				where: eq(v2Projects.id, input.id),
			});

			const parsed = existing?.repoCloneUrl
				? parseGitHubRemote(existing.repoCloneUrl)
				: null;
			if (!parsed) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Project has no linked GitHub repository",
				});
			}

			const url = await fetchAndStoreGitHubAvatar({
				owner: parsed.owner,
				pathnamePrefix: `v2-project/${input.id}/icon`,
				existingUrl: existing?.iconUrl ?? null,
			});
			if (!url) {
				throw new TRPCError({
					code: "BAD_GATEWAY",
					message: "Could not fetch GitHub avatar",
				});
			}

			const { updated, txid } = await dbWs.transaction(async (tx) => {
				const [row] = await tx
					.update(v2Projects)
					.set({ iconUrl: url })
					.where(eq(v2Projects.id, input.id))
					.returning();
				const currentTxid = await getCurrentTxid(tx);
				return { updated: row, txid: currentTxid };
			});

			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found",
				});
			}
			return { ...updated, txid };
		}),

	removeIcon: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			await getProjectAccess(ctx.session.user.id, input.id, {
				organizationId,
			});

			const existing = await dbWs.query.v2Projects.findFirst({
				columns: { iconUrl: true },
				where: eq(v2Projects.id, input.id),
			});

			if (existing?.iconUrl) {
				try {
					await del(existing.iconUrl);
				} catch {}
			}

			const { updated, txid } = await dbWs.transaction(async (tx) => {
				const [row] = await tx
					.update(v2Projects)
					.set({ iconUrl: null })
					.where(eq(v2Projects.id, input.id))
					.returning();
				const currentTxid = await getCurrentTxid(tx);
				return { updated: row, txid: currentTxid };
			});

			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found",
				});
			}
			return { ...updated, txid };
		}),
} satisfies TRPCRouterRecord;

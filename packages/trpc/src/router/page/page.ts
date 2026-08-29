import { db } from "@superset/db/client";
import {
	members,
	organizations,
	pages,
	pageVersions,
	type SelectPage,
	users,
	workspacePages,
} from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { del, head } from "@vercel/blob";
import { and, desc, eq, or, type SQL, sql } from "drizzle-orm";
import { protectedProcedure, userError } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { assertPageReadable, assertPageWritable } from "./access";
import { pageUrl } from "./page-url";
import { publishPage } from "./publish";
import {
	clearPageWatchSchema,
	deletePageSchema,
	listPagesSchema,
	pageRefSchema,
	publishPageSchema,
	pullPageSchema,
	setPageVisibilitySchema,
	setPageWatchSchema,
	setSharedVersionSchema,
} from "./schema";
import { resolveSharedVersion, servedVersion } from "./shared-version";
import { watchState } from "./watch";
import { assertWorkspaceAccess } from "./workspace-access";

function visibilityFilter(userId: string) {
	return or(
		eq(pages.visibility, "org"),
		and(eq(pages.visibility, "just_me"), eq(pages.createdByUserId, userId)),
	);
}

async function pageNotFound(identity: SQL, userId: string): Promise<TRPCError> {
	const [elsewhere] = await db
		.select({ organizationName: organizations.name })
		.from(pages)
		.innerJoin(
			members,
			and(
				eq(members.organizationId, pages.organizationId),
				eq(members.userId, userId),
			),
		)
		.innerJoin(organizations, eq(organizations.id, pages.organizationId))
		.where(and(identity, visibilityFilter(userId)))
		.limit(1);

	if (!elsewhere) {
		return userError({
			code: "NOT_FOUND",
			message: "Page not found",
			i18nKey: "serverError.page.pageNotFound",
		});
	}
	return new TRPCError({
		code: "FORBIDDEN",
		message: `This page belongs to ${elsewhere.organizationName}. Switch to that organization to open it.`,
	});
}

async function loadPage({
	id,
	slug,
	organizationId,
	userId,
}: {
	id?: string;
	slug?: string;
	organizationId: string;
	userId: string;
}): Promise<SelectPage> {
	const identity = id ? eq(pages.id, id) : slug ? eq(pages.slug, slug) : null;
	if (!identity) {
		throw userError({
			code: "BAD_REQUEST",
			message: "Provide either id or slug",
			i18nKey: "serverError.page.provideEitherIdOrSlug",
		});
	}

	const [page] = await db
		.select()
		.from(pages)
		.where(and(eq(pages.organizationId, organizationId), identity))
		.limit(1);

	if (!page) {
		throw await pageNotFound(identity, userId);
	}
	assertPageReadable(page, userId);
	return page;
}

async function loadOwner(userId: string | null) {
	if (!userId) return null;
	const [owner] = await db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			image: users.image,
		})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return owner ?? null;
}

async function latestVersionNumber(pageId: string): Promise<number | null> {
	const [row] = await db
		.select({ version: pageVersions.version })
		.from(pageVersions)
		.where(eq(pageVersions.pageId, pageId))
		.orderBy(desc(pageVersions.version))
		.limit(1);
	return row?.version ?? null;
}

export const pageRouter = {
	publish: protectedProcedure
		.input(publishPageSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			return await publishPage({
				input,
				organizationId,
				userId: ctx.session.user.id,
			});
		}),

	list: protectedProcedure
		.input(listPagesSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			if (input?.workspaceId) {
				await assertWorkspaceAccess({
					executor: db,
					workspaceId: input.workspaceId,
					organizationId,
				});
			}

			const latest = db
				.select({
					version: pageVersions.version,
					contentType: pageVersions.contentType,
					sizeBytes: pageVersions.sizeBytes,
					publishedAt: pageVersions.createdAt,
				})
				.from(pageVersions)
				.where(eq(pageVersions.pageId, pages.id))
				.orderBy(desc(pageVersions.version))
				.limit(1)
				.as("latest");

			const base = db
				.select({
					id: pages.id,
					slug: pages.slug,
					title: pages.title,
					description: pages.description,
					visibility: pages.visibility,
					sharedVersion: pages.sharedVersion,
					createdAt: pages.createdAt,
					updatedAt: pages.updatedAt,
					createdByUserId: pages.createdByUserId,
					ownerName: users.name,
					latestVersion: latest.version,
					contentType: latest.contentType,
					sizeBytes: latest.sizeBytes,
					publishedAt: latest.publishedAt,
				})
				.from(pages)
				.leftJoin(users, eq(users.id, pages.createdByUserId))
				.leftJoinLateral(latest, sql`true`);

			const scoped = input?.workspaceId
				? base
						.innerJoin(workspacePages, eq(workspacePages.pageId, pages.id))
						.where(
							and(
								eq(pages.organizationId, organizationId),
								eq(workspacePages.workspaceId, input.workspaceId),
								visibilityFilter(userId),
							),
						)
				: base.where(
						and(
							eq(pages.organizationId, organizationId),
							visibilityFilter(userId),
						),
					);

			const rows = await scoped.orderBy(desc(pages.updatedAt));
			return rows.map((row) => ({ ...row, url: pageUrl(row.slug) }));
		}),

	get: protectedProcedure.input(pageRefSchema).query(async ({ ctx, input }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		const page = await loadPage({
			id: input.id,
			slug: input.slug,
			organizationId,
			userId: ctx.session.user.id,
		});

		const latestVersion = await latestVersionNumber(page.id);
		return {
			...page,
			url: pageUrl(page.slug),
			latestVersion,
			servedVersion: servedVersion(page.sharedVersion, latestVersion),
			watch: watchState(page, Date.now()),
		};
	}),

	setVisibility: protectedProcedure
		.input(setPageVisibilitySchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const page = await loadPage({ id: input.id, organizationId, userId });
			assertPageWritable(page, userId);

			const [updated] = await db
				.update(pages)
				.set({ visibility: input.visibility })
				.where(eq(pages.id, page.id))
				.returning();

			if (!updated) {
				throw userError({
					code: "NOT_FOUND",
					message: "Page not found",
					i18nKey: "serverError.page.pageNotFound",
				});
			}
			return { id: updated.id, visibility: updated.visibility };
		}),

	setWatch: protectedProcedure
		.input(setPageWatchSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const page = await loadPage({ id: input.id, organizationId, userId });
			assertPageWritable(page, userId);

			await db
				.update(pages)
				.set({
					watchedByAgent: input.agentId,
					watchHeartbeatAt: new Date(),
				})
				.where(eq(pages.id, page.id));

			return { id: page.id };
		}),

	clearWatch: protectedProcedure
		.input(clearPageWatchSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const page = await loadPage({ id: input.id, organizationId, userId });
			assertPageWritable(page, userId);

			await db
				.update(pages)
				.set({ watchedByAgent: null, watchHeartbeatAt: null })
				.where(eq(pages.id, page.id));

			return { id: page.id };
		}),

	access: protectedProcedure
		.input(pageRefSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const page = await loadPage({
				id: input.id,
				slug: input.slug,
				organizationId,
				userId: ctx.session.user.id,
			});

			return { owner: await loadOwner(page.createdByUserId) };
		}),

	setSharedVersion: protectedProcedure
		.input(setSharedVersionSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const page = await loadPage({ id: input.id, organizationId, userId });
			assertPageWritable(page, userId);

			if (input.version !== null) {
				const [row] = await db
					.select({ version: pageVersions.version })
					.from(pageVersions)
					.where(
						and(
							eq(pageVersions.pageId, page.id),
							eq(pageVersions.version, input.version),
						),
					)
					.limit(1);
				if (!row) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Version ${input.version} not found`,
					});
				}
			}

			const resolved = resolveSharedVersion(
				input.version,
				await latestVersionNumber(page.id),
			);

			const [updated] = await db
				.update(pages)
				.set({ sharedVersion: resolved })
				.where(eq(pages.id, page.id))
				.returning();

			if (!updated) {
				throw userError({
					code: "NOT_FOUND",
					message: "Page not found",
					i18nKey: "serverError.page.pageNotFound",
				});
			}
			return { id: updated.id, sharedVersion: updated.sharedVersion };
		}),

	delete: protectedProcedure
		.input(deletePageSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const page = await loadPage({ id: input.id, organizationId, userId });
			assertPageWritable(page, userId);

			const rows = await db
				.select({ blobPathname: pageVersions.blobPathname })
				.from(pageVersions)
				.where(eq(pageVersions.pageId, page.id));

			await db.delete(pages).where(eq(pages.id, page.id));

			const pathnames = rows.map((row) => row.blobPathname);
			if (pathnames.length > 0) {
				try {
					await del(pathnames);
				} catch (error) {
					console.error("[pages] blob cleanup failed after delete", {
						pageId: page.id,
						pathnames,
						error,
					});
				}
			}

			return { id: page.id };
		}),

	versions: protectedProcedure
		.input(pageRefSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const page = await loadPage({
				id: input.id,
				slug: input.slug,
				organizationId,
				userId: ctx.session.user.id,
			});

			return await db
				.select({
					version: pageVersions.version,
					label: pageVersions.label,
					contentType: pageVersions.contentType,
					sizeBytes: pageVersions.sizeBytes,
					sha256: pageVersions.sha256,
					createdAt: pageVersions.createdAt,
					createdByUserId: pageVersions.createdByUserId,
				})
				.from(pageVersions)
				.where(eq(pageVersions.pageId, page.id))
				.orderBy(desc(pageVersions.version));
		}),

	pull: protectedProcedure
		.input(pullPageSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const page = await loadPage({
				id: input.id,
				slug: input.slug,
				organizationId,
				userId: ctx.session.user.id,
			});

			const latestVersion = await latestVersionNumber(page.id);
			const version =
				input.version ?? servedVersion(page.sharedVersion, latestVersion);
			if (version === null) {
				throw userError({
					code: "NOT_FOUND",
					message: "Page has no versions",
					i18nKey: "serverError.page.pageHasNoVersions",
				});
			}

			const [row] = await db
				.select()
				.from(pageVersions)
				.where(
					and(
						eq(pageVersions.pageId, page.id),
						eq(pageVersions.version, version),
					),
				)
				.limit(1);

			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Version ${version} not found`,
				});
			}

			let downloadUrl: string;
			try {
				downloadUrl = (await head(row.blobPathname)).url;
			} catch (error) {
				console.error("[pages] head failed", {
					pageId: page.id,
					version,
					error,
				});
				throw userError({
					code: "NOT_FOUND",
					message: "Page content is not available",
					i18nKey: "serverError.page.pageContentIsNotAvailable",
				});
			}

			return {
				id: page.id,
				slug: page.slug,
				url: pageUrl(page.slug),
				title: page.title,
				description: page.description,
				visibility: page.visibility,
				createdByUserId: page.createdByUserId,
				updatedAt: page.updatedAt,
				sharedVersion: page.sharedVersion,
				latestVersion,
				servedVersion: servedVersion(page.sharedVersion, latestVersion),
				watch: watchState(page, Date.now()),
				version: row.version,
				label: row.label,
				contentType: row.contentType,
				sizeBytes: row.sizeBytes,
				sha256: row.sha256,
				createdAt: row.createdAt,
				downloadUrl,
			};
		}),
} satisfies TRPCRouterRecord;

import { db } from "@superset/db/client";
import {
	members,
	organizations,
	pages,
	pageVersions,
	type SelectPage,
	workspacePages,
} from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { head } from "@vercel/blob";
import { and, desc, eq, or, type SQL, sql } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { assertPageReadable, assertPageWritable } from "./access";
import { pageUrl } from "./page-url";
import { publishPage } from "./publish";
import {
	listPagesSchema,
	pageRefSchema,
	publishPageSchema,
	pullPageSchema,
	setPageVisibilitySchema,
} from "./schema";
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
		return new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
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
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Provide either id or slug",
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
					latestVersion: latest.version,
					contentType: latest.contentType,
					sizeBytes: latest.sizeBytes,
					publishedAt: latest.publishedAt,
				})
				.from(pages)
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
			servedVersion: page.sharedVersion ?? latestVersion,
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
				throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
			}
			return { id: updated.id, visibility: updated.visibility };
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

			const version =
				input.version ??
				page.sharedVersion ??
				(await latestVersionNumber(page.id));
			if (version === null) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Page has no versions",
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
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Page content is not available",
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

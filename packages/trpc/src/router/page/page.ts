import { db, dbWs } from "@superset/db/client";
import {
	attachments,
	files,
	members,
	organizations,
	pages,
	pageVersions,
	type SelectPage,
	users,
	workspacePages,
} from "@superset/db/schema";
import { mintPageSlug } from "@superset/shared/page-slug";
import {
	fileOriginalKey,
	pageManifestKey,
	pageThumbnailKey,
	pageThumbnailUrl,
	pageViewUrl,
} from "@superset/shared/usercontent";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { deleteObjects, presignedGetUrl } from "../../lib/r2";
import { protectedProcedure, userError } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { assertPageReadable, assertPageWritable } from "./access";
import { pageAssetRouter } from "./assets";
import { pageUrl } from "./page-url";
import { publishPage } from "./publish";
import { isEntryPathConflict } from "./publish-rules";
import {
	clearPageWatchSchema,
	createPageSchema,
	deletePageSchema,
	listPagesSchema,
	pageFields,
	pageRefSchema,
	publishPageSchema,
	pullPageSchema,
	setPageVisibilitySchema,
	setPageWatchSchema,
	setSharedVersionSchema,
} from "./schema";
import { resolveSharedVersion, servedVersion } from "./shared-version";
import {
	deletePageObjects,
	mintPageTicket,
	writePageManifest,
} from "./storage";
import { enqueuePageThumbnail } from "./thumbnail";
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
	assets: pageAssetRouter,

	/**
	 * A page with no versions yet. Assets stage against a page id, so a first
	 * publish that carries them creates the page here and publishes into it.
	 * A publish with no assets still mints its own page and never needs this.
	 */
	create: protectedProcedure
		.input(createPageSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const title = input.title ?? "Untitled";
			// neon-http has no transactions; the pooled client does.
			return await dbWs.transaction(async (tx) => {
				const [page] = await tx
					.insert(pages)
					.values({
						slug: mintPageSlug(title),
						organizationId,
						createdByUserId: userId,
						title,
						description: input.description ?? null,
						visibility: input.visibility ?? "org",
					})
					.returning();
				if (!page) {
					throw userError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create page",
						i18nKey: "serverError.page.failedToCreatePage",
					});
				}
				if (input.workspaceId && input.entryPath) {
					await assertWorkspaceAccess({
						executor: tx,
						workspaceId: input.workspaceId,
						organizationId,
					});
					try {
						await tx
							.insert(workspacePages)
							.values({
								workspaceId: input.workspaceId,
								pageId: page.id,
								entryPath: input.entryPath,
							})
							// Targeted at the primary key, so it stays a no-op for a page
							// already linked to this path. It deliberately does not cover
							// the (workspace, entryPath) unique index — a colleague's page
							// holding this path has to surface, not be swallowed.
							.onConflictDoNothing({
								target: [workspacePages.workspaceId, workspacePages.pageId],
							});
					} catch (error) {
						if (!isEntryPathConflict(error)) throw error;
						throw new TRPCError({
							code: "CONFLICT",
							message: `Someone else has already published ${input.entryPath} from this workspace. Publish with an explicit page id to add a version to their page, or move the file.`,
						});
					}
				}
				return {
					id: page.id,
					slug: page.slug,
					url: pageUrl(page.slug),
					title: page.title,
					visibility: page.visibility,
				};
			});
		}),

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
			const baseUrl = env.USERCONTENT_URL;
			return await Promise.all(
				rows.map(async (row) => {
					const served = servedVersion(row.sharedVersion, row.latestVersion);
					const ticket = await mintPageTicket(row);
					// Version-bound, so it turns daily instead of hourly — the capture
					// is immutable and the stable URL is what lets it cache.
					const thumbnailTicket =
						served === null
							? undefined
							: await mintPageTicket(row, { version: served });
					return {
						...row,
						url: pageUrl(row.slug),
						viewUrl: pageViewUrl({ baseUrl, pageId: row.id, ticket }),
						thumbnailUrl:
							served === null
								? null
								: pageThumbnailUrl({
										baseUrl,
										pageId: row.id,
										version: served,
										ticket: thumbnailTicket,
									}),
						thumbnailStorageKey:
							served === null ? null : pageThumbnailKey(row.id, served),
					};
				}),
			);
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
		const served = servedVersion(page.sharedVersion, latestVersion);
		return {
			...page,
			url: pageUrl(page.slug),
			viewUrl: pageViewUrl({
				baseUrl: env.USERCONTENT_URL,
				pageId: page.id,
				version: served,
				ticket: await mintPageTicket(
					page,
					served === null ? {} : { version: served },
				),
			}),
			latestVersion,
			servedVersion: served,
			watch: watchState(page, Date.now()),
		};
	}),

	/**
	 * The page a workspace path anchors to, for the CLI's directory publish:
	 * it compares each asset's hash against the previous version and reuses
	 * unchanged files instead of re-uploading. Mirrors the republish lookup —
	 * only the caller's own pages match.
	 */
	resolveByEntryPath: protectedProcedure
		.input(
			z
				.object({
					workspaceId: pageFields.workspaceId.optional(),
					entryPath: pageFields.entryPath.optional(),
					pageId: pageFields.id.optional(),
				})
				.refine(
					(value) =>
						value.pageId !== undefined ||
						(value.workspaceId !== undefined && value.entryPath !== undefined),
					{ message: "Provide pageId, or workspaceId and entryPath together" },
				),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const [row] = input.pageId
				? await db
						.select({ page: pages })
						.from(pages)
						.where(
							and(
								eq(pages.id, input.pageId),
								eq(pages.organizationId, organizationId),
								eq(pages.createdByUserId, userId),
							),
						)
						.limit(1)
				: await db
						.select({ page: pages })
						.from(workspacePages)
						.innerJoin(pages, eq(pages.id, workspacePages.pageId))
						.where(
							and(
								eq(workspacePages.workspaceId, input.workspaceId ?? ""),
								eq(workspacePages.entryPath, input.entryPath ?? ""),
								eq(pages.organizationId, organizationId),
								eq(pages.createdByUserId, userId),
							),
						)
						.limit(1);
			if (!row) return null;
			const [latest] = await db
				.select({ id: pageVersions.id, version: pageVersions.version })
				.from(pageVersions)
				.where(eq(pageVersions.pageId, row.page.id))
				.orderBy(desc(pageVersions.version))
				.limit(1);
			return {
				id: row.page.id,
				slug: row.page.slug,
				latestVersion: latest?.version ?? null,
				latestVersionId: latest?.id ?? null,
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
			await writePageManifest(page.id);
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

			const latestVersion = await latestVersionNumber(page.id);
			const resolved = resolveSharedVersion(input.version, latestVersion);

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
			await writePageManifest(page.id);
			// The pin may land on a version that was superseded before it was
			// ever captured; one already captured is skipped by the job.
			const served = servedVersion(resolved, latestVersion);
			if (served !== null) {
				void enqueuePageThumbnail({ pageId: page.id, version: served });
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
				.select({
					id: pageVersions.id,
					version: pageVersions.version,
					key: pageVersions.storageKey,
				})
				.from(pageVersions)
				.where(eq(pageVersions.pageId, page.id));

			// The manifest is the Worker's authorization source: removing it
			// first makes deletion fail closed. If this throws, nothing has
			// been deleted and the page still serves; once it is gone the
			// origin 404s even if the cleanup below is interrupted.
			await deleteObjects([pageManifestKey(page.id)]);

			await db.delete(pages).where(eq(pages.id, page.id));

			try {
				await deletePageObjects({
					pageId: page.id,
					versions: rows,
				});
				// `attachments.parentId` carries no foreign key (its parent kind
				// varies), so the version cascade leaves attachment rows behind;
				// files referenced by nothing else go with them, bytes included.
				const versionIds = rows.map((row) => row.id);
				if (versionIds.length > 0) {
					const removed = await db
						.delete(attachments)
						.where(
							and(
								eq(attachments.parentKind, "page_version"),
								inArray(attachments.parentId, versionIds),
							),
						)
						.returning({ fileId: attachments.fileId });
					const fileIds = [...new Set(removed.map((row) => row.fileId))];
					if (fileIds.length > 0) {
						const stillReferenced = new Set(
							(
								await db
									.select({ fileId: attachments.fileId })
									.from(attachments)
									.where(inArray(attachments.fileId, fileIds))
							).map((row) => row.fileId),
						);
						const orphans = fileIds.filter((id) => !stillReferenced.has(id));
						if (orphans.length > 0) {
							await deleteObjects(orphans.map(fileOriginalKey));
							await db.delete(files).where(inArray(files.id, orphans));
						}
					}
				}
			} catch (error) {
				console.error("[pages] storage cleanup failed after delete", {
					pageId: page.id,
					error,
				});
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
				downloadUrl = await presignedGetUrl(row.storageKey);
			} catch (error) {
				console.error("[pages] presign failed", {
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

			const viewUrl = pageViewUrl({
				baseUrl: env.USERCONTENT_URL,
				pageId: page.id,
				version: row.version,
				ticket: await mintPageTicket(page, { version: row.version }),
			});

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
				storageKey: row.storageKey,
				downloadUrl,
				viewUrl,
			};
		}),
} satisfies TRPCRouterRecord;

import { randomUUID } from "node:crypto";
import { dbWs } from "@superset/db/client";
import {
	attachments,
	files,
	pages,
	pageVersions,
	type SelectPage,
	type SelectPageVersion,
	workspacePages,
} from "@superset/db/schema";
import { mintPageSlug } from "@superset/shared/page-slug";
import { pageVersionKey } from "@superset/shared/usercontent";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { userError } from "../../i18n-error";
import { putObject } from "../../lib/r2";
import { assertPageWritable } from "./access";
import { pageUrl } from "./page-url";
import {
	isEntryPathConflict,
	isVersionConflict,
	titleFromFilename,
	validateAssetPaths,
	validatePublishContent,
} from "./publish-rules";
import type { PublishPageInput } from "./schema";
import { writePageManifest } from "./storage";
import { enqueuePageThumbnail } from "./thumbnail";
import { assertWorkspaceAccess } from "./workspace-access";

const MAX_PUBLISH_ATTEMPTS = 5;

type PublishedVersion = Pick<
	SelectPage,
	"id" | "slug" | "title" | "description" | "visibility"
> &
	Pick<
		SelectPageVersion,
		"version" | "label" | "contentType" | "sizeBytes" | "createdAt"
	> & { url: string };

/**
 * The page this publish reserved its version under was created or removed
 * by another publish in the meantime, so the bytes sit under the wrong id.
 */
class TargetPageChanged extends Error {}

export async function publishPage({
	input,
	organizationId,
	userId,
}: {
	input: PublishPageInput;
	organizationId: string;
	userId: string;
}) {
	const { buffer, sha256 } = validatePublishContent(input);
	validateAssetPaths(input.assets);

	for (let attempt = 1; ; attempt += 1) {
		try {
			return await runPublish({
				input,
				organizationId,
				userId,
				buffer,
				sha256,
			});
		} catch (error) {
			if (!isVersionConflict(error) && !(error instanceof TargetPageChanged)) {
				throw error;
			}
			if (attempt < MAX_PUBLISH_ATTEMPTS) continue;
			throw userError({
				code: "CONFLICT",
				message: "This page is being published from somewhere else — retry",
				i18nKey: "serverError.page.thisPageIsBeingPublishedFrom",
			});
		}
	}
}

async function runPublish({
	input,
	organizationId,
	userId,
	buffer,
	sha256,
}: {
	input: PublishPageInput;
	organizationId: string;
	userId: string;
	buffer: Buffer;
	sha256: string;
}) {
	// The version number is reserved before the bytes move so the key can
	// name it. A concurrent publish of the same page collides on the unique
	// (page, version) index and retries under the next number.
	const target = await resolveTargetPage({
		executor: dbWs,
		input,
		organizationId,
		userId,
	});
	await verifyPublishAssets({
		assets: input.assets,
		organizationId,
		userId,
		pageId: target?.id ?? null,
	});
	const pageId = target?.id ?? randomUUID();
	const version = (target ? await latestVersionNumber(dbWs, target.id) : 0) + 1;
	const key = pageVersionKey(pageId, version);

	const published: PublishedVersion = await dbWs.transaction(async (tx) => {
		const existing = await resolveTargetPage({
			executor: tx,
			input,
			organizationId,
			userId,
		});
		if ((existing?.id ?? null) !== (target?.id ?? null)) {
			throw new TargetPageChanged();
		}

		const page = existing
			? await applyMetadata({ tx, page: existing, input })
			: await createPage({ tx, id: pageId, input, organizationId, userId });

		if (!input.pageId && input.workspaceId && input.entryPath) {
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
					// Targeted at the primary key, so re-linking a page to the path it
					// already holds stays a no-op. An untargeted version would also
					// swallow the entry-path collision below, committing a page linked
					// to no workspace and reporting it as a success.
					.onConflictDoNothing({
						target: [workspacePages.workspaceId, workspacePages.pageId],
					});
			} catch (error) {
				if (!isEntryPathConflict(error)) throw error;
				// Reachable because the republish lookup only matches the caller's own
				// pages: a colleague's page holding this path is invisible to it.
				throw new TRPCError({
					code: "CONFLICT",
					message: `Someone else has already published ${input.entryPath} from this workspace. Publish with an explicit page id to add a version to their page, or move the file.`,
				});
			}
		}

		const [row] = await tx
			.insert(pageVersions)
			.values({
				pageId: page.id,
				version,
				label: input.label ?? null,
				storageKey: key,
				contentType: input.contentType,
				sizeBytes: buffer.length,
				sha256,
				createdByUserId: userId,
			})
			.returning();

		if (!row) {
			throw userError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to record page version",
				i18nKey: "serverError.page.failedToRecordPageVersion",
			});
		}

		// Upload while the transaction holds the unique (page, version)
		// slot: a concurrent publish of this number conflicts on the
		// insert above before its own upload, so no attempt can overwrite
		// a committed object or delete another's. A rollback after this
		// upload strands the object under a number the next attempt
		// reuses and overwrites.
		if (input.assets && input.assets.length > 0) {
			await tx.insert(attachments).values(
				input.assets.map((asset) => ({
					fileId: asset.fileId,
					parentKind: "page_version" as const,
					parentId: row.id,
					path: asset.path,
				})),
			);
		}

		await putObject({ key, body: buffer, contentType: input.contentType });
		return {
			id: page.id,
			slug: page.slug,
			url: pageUrl(page.slug),
			title: page.title,
			description: page.description,
			visibility: page.visibility,
			version: row.version,
			label: row.label,
			contentType: row.contentType,
			sizeBytes: row.sizeBytes,
			createdAt: row.createdAt,
		};
	});

	// The manifest is what the page's origin serves from, so the publish is
	// not done until it is written. The thumbnail is best effort.
	await writePageManifest(published.id);
	void enqueuePageThumbnail({
		pageId: published.id,
		version: published.version,
	});
	return published;
}

/**
 * An asset may only ride a publish if the caller uploaded it, or it already
 * belongs to this page's lineage (the republish-reuse path). Without the
 * ownership check, any org-visible file id could be republished to a wider
 * audience on someone's `everyone` page.
 */
async function verifyPublishAssets({
	assets,
	organizationId,
	userId,
	pageId,
}: {
	assets: PublishPageInput["assets"];
	organizationId: string;
	userId: string;
	pageId: string | null;
}): Promise<void> {
	if (!assets || assets.length === 0) return;
	const ids = [...new Set(assets.map((asset) => asset.fileId))];
	const rows = await dbWs
		.select({
			id: files.id,
			status: files.status,
			createdByUserId: files.createdByUserId,
		})
		.from(files)
		.where(
			and(inArray(files.id, ids), eq(files.organizationId, organizationId)),
		);
	const lineage = new Set<string>();
	if (pageId) {
		const attached = await dbWs
			.select({ fileId: attachments.fileId })
			.from(attachments)
			.innerJoin(pageVersions, eq(pageVersions.id, attachments.parentId))
			.where(
				and(
					eq(attachments.parentKind, "page_version"),
					eq(pageVersions.pageId, pageId),
					inArray(attachments.fileId, ids),
				),
			);
		for (const row of attached) lineage.add(row.fileId);
	}
	const allowed = new Set(
		rows
			.filter(
				(row) =>
					row.status === "ready" &&
					(row.createdByUserId === userId || lineage.has(row.id)),
			)
			.map((row) => row.id),
	);
	const refused = ids.find((id) => !allowed.has(id));
	if (refused) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Asset file ${refused} is missing, not completed, or not yours to attach`,
		});
	}
}

type Tx = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

type Executor = Pick<Tx, "select">;

async function latestVersionNumber(
	executor: Executor,
	pageId: string,
): Promise<number> {
	const [latest] = await executor
		.select({ version: pageVersions.version })
		.from(pageVersions)
		.where(eq(pageVersions.pageId, pageId))
		.orderBy(desc(pageVersions.version))
		.limit(1);
	return latest?.version ?? 0;
}

async function resolveTargetPage({
	executor,
	input,
	organizationId,
	userId,
}: {
	executor: Executor;
	input: PublishPageInput;
	organizationId: string;
	userId: string;
}): Promise<SelectPage | null> {
	if (input.pageId) {
		const [page] = await executor
			.select()
			.from(pages)
			.where(
				and(
					eq(pages.id, input.pageId),
					eq(pages.organizationId, organizationId),
				),
			)
			.limit(1);
		if (!page) {
			throw userError({
				code: "NOT_FOUND",
				message: "Page not found",
				i18nKey: "serverError.page.pageNotFound",
			});
		}
		assertPageWritable(page, userId);
		return page;
	}

	if (input.workspaceId && input.entryPath) {
		const [row] = await executor
			.select({ page: pages })
			.from(workspacePages)
			.innerJoin(pages, eq(pages.id, workspacePages.pageId))
			.where(
				and(
					eq(workspacePages.workspaceId, input.workspaceId),
					eq(workspacePages.entryPath, input.entryPath),
					eq(pages.organizationId, organizationId),
					eq(pages.createdByUserId, userId),
				),
			)
			.limit(1);
		if (row?.page) assertPageWritable(row.page, userId);
		return row?.page ?? null;
	}

	return null;
}

async function applyMetadata({
	tx,
	page,
	input,
}: {
	tx: Tx;
	page: SelectPage;
	input: PublishPageInput;
}): Promise<SelectPage> {
	const patch: Partial<SelectPage> = { updatedAt: new Date() };
	if (input.title !== undefined) patch.title = input.title;
	if (input.description !== undefined) patch.description = input.description;
	if (input.visibility !== undefined) patch.visibility = input.visibility;

	const [updated] = await tx
		.update(pages)
		.set(patch)
		.where(eq(pages.id, page.id))
		.returning();
	return updated ?? page;
}

async function createPage({
	tx,
	id,
	input,
	organizationId,
	userId,
}: {
	tx: Tx;
	id: string;
	input: PublishPageInput;
	organizationId: string;
	userId: string;
}): Promise<SelectPage> {
	const title = input.title ?? titleFromFilename(input.filename);
	const [page] = await tx
		.insert(pages)
		.values({
			id,
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
	return page;
}

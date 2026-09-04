import { randomUUID } from "node:crypto";
import { db, dbWs } from "@superset/db/client";
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
import { fileOriginalKey, pageVersionKey } from "@superset/shared/usercontent";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { userError } from "../../i18n-error";
import { SNIFF_BYTES, sniffContentType } from "../../lib/files";
import { getObject, headObject, putObject } from "../../lib/r2";
import { assertPageWritable } from "./access";
import { pageUrl } from "./page-url";
import {
	isEntryPathConflict,
	isVersionConflict,
	titleFromFilename,
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
		executor: db,
		input,
		organizationId,
		userId,
	});
	// A presigned PUT lands without us seeing it, so this is the first and
	// only place the bytes are checked against what upload declared. Doing it
	// before the version is reserved keeps a failed asset from burning a
	// version number.
	const staged = target ? await verifyStagedAssets(target.id) : [];
	const pageId = target?.id ?? randomUUID();
	const version = (target ? await latestVersionNumber(db, target.id) : 0) + 1;
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
		if (staged.length > 0) {
			await tx.insert(attachments).values(
				staged.map((asset) => ({
					fileId: asset.fileId,
					parentKind: "page_version" as const,
					parentId: row.id,
					path: asset.path,
				})),
			);
			// Staging means "new for the next version". Clearing it here is what
			// makes that true: an asset the next publish still wants is reused
			// from this version's rows by content hash, not left staged.
			//
			// Only the rows this version actually snapshotted. `staged` was read
			// before the transaction, so a concurrent upload may have staged a
			// path since; deleting the whole page's staging would drop that asset
			// without attaching it anywhere — silently, and out of the next
			// publish too, because its staging record would be gone.
			await tx.delete(attachments).where(
				inArray(
					attachments.id,
					staged.map((asset) => asset.id),
				),
			);
		}

		await putObject({
			key,
			body: buffer,
			contentType: input.contentType,
			bucket: "private",
		});
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
 * Turns what is staged for a page into what the next version will carry.
 *
 * Every staged asset is checked here because a presigned PUT bypasses the
 * API: HEAD confirms the size `upload` was told, a ranged read establishes
 * what the bytes really are, and the stored type becomes the sniffed one so
 * serve-time policy never keys on a declaration. A `ready` row was verified
 * by an earlier publish and is taken as-is.
 */
async function verifyStagedAssets(
	pageId: string,
): Promise<{ id: string; fileId: string; path: string }[]> {
	const rows = await db
		.select({ file: files, path: attachments.path, id: attachments.id })
		.from(attachments)
		.innerJoin(files, eq(files.id, attachments.fileId))
		.where(
			and(eq(attachments.parentKind, "page"), eq(attachments.parentId, pageId)),
		);

	return await Promise.all(
		rows.map(async ({ file, path, id }) => {
			if (!path) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Staged asset has no path",
				});
			}
			if (file.status === "ready") return { id, fileId: file.id, path };

			// Explicitly typed so a `refuse` call narrows what follows it.
			const refuse: (reason: string) => never = (reason) => {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Asset ${JSON.stringify(path)} ${reason}`,
				});
			};
			const key = fileOriginalKey(file.id);
			const head = await headObject(key);
			if (!head) refuse("was never uploaded — send the bytes first");
			if (head.sizeBytes !== file.sizeBytes) {
				refuse("does not match the size it declared — upload it again");
			}
			const sample = await getObject(key, {
				range: `bytes=0-${SNIFF_BYTES - 1}`,
			});
			const bytes = sample
				? new Uint8Array(await sample.arrayBuffer())
				: new Uint8Array();

			// Guarded on `pending`: if the sweep claimed this row mid-publish, the
			// update matches nothing and the asset has to be uploaded again.
			const [updated] = await db
				.update(files)
				.set({
					contentType: sniffContentType(bytes, file.contentType),
					status: "ready",
				})
				.where(and(eq(files.id, file.id), eq(files.status, "pending")))
				.returning({ id: files.id });
			if (!updated) refuse("expired before publishing — upload it again");
			return { id, fileId: file.id, path };
		}),
	);
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

import { dbWs } from "@superset/db/client";
import {
	attachments,
	files,
	pages,
	pageVersions,
	type SelectPage,
	workspacePages,
} from "@superset/db/schema";
import { mintPageSlug } from "@superset/shared/page-slug";
import { TRPCError } from "@trpc/server";
import { del, put } from "@vercel/blob";
import { and, desc, eq, inArray } from "drizzle-orm";
import { assertPageReadable } from "./access";
import { pageUrl } from "./page-url";
import {
	isVersionConflict,
	titleFromFilename,
	validatePublishContent,
} from "./publish-rules";
import type { PublishPageInput } from "./schema";
import { assertWorkspaceAccess } from "./workspace-access";

const MAX_PUBLISH_ATTEMPTS = 3;

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
			if (isVersionConflict(error) && attempt < MAX_PUBLISH_ATTEMPTS) continue;
			throw error;
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
	// The blob upload sits inside the transaction so a failed version insert
	// rolls the page back with it. Publishing is low-frequency and the payload
	// is capped at 3 MB, so holding the connection across the upload is cheaper
	// than reconciling a page that exists with no version under it.
	let uploadedUrl: string | null = null;
	try {
		return await dbWs.transaction(async (tx) => {
			const existing = await resolveTargetPage({
				tx,
				input,
				organizationId,
				userId,
			});

			const page = existing
				? await applyMetadata({ tx, page: existing, input })
				: await createPage({ tx, input, organizationId, userId });

			if (input.workspaceId && input.entryPath) {
				// Before binding this id to a page: an unchecked workspaceId lets
				// one member squat another's republish key.
				await assertWorkspaceAccess({
					executor: tx,
					workspaceId: input.workspaceId,
					organizationId,
				});
				await tx
					.insert(workspacePages)
					.values({
						workspaceId: input.workspaceId,
						pageId: page.id,
						entryPath: input.entryPath,
					})
					// The link may already exist, or that (workspace, entry_path) may
					// already belong to another page. An explicit --page wins for this
					// publish either way; it does not steal an existing link.
					.onConflictDoNothing();
			}

			const [latest] = await tx
				.select({ version: pageVersions.version })
				.from(pageVersions)
				.where(eq(pageVersions.pageId, page.id))
				.orderBy(desc(pageVersions.version))
				.limit(1);
			const version = (latest?.version ?? 0) + 1;

			const blob = await put(
				`pages/${page.id}/${version}/${input.filename}`,
				buffer,
				{
					access: "public",
					contentType: input.contentType,
					// The bytes are world-readable once the URL is known, so the random
					// suffix is what keeps a just_me page from being reachable by
					// guessing its path. Visibility is still enforced by whatever serves
					// the page; this is defence in depth, not the gate.
					addRandomSuffix: true,
				},
			);
			uploadedUrl = blob.url;

			const [row] = await tx
				.insert(pageVersions)
				.values({
					pageId: page.id,
					version,
					label: input.label ?? null,
					blobPathname: blob.pathname,
					contentType: input.contentType,
					sizeBytes: buffer.length,
					sha256,
					createdByUserId: userId,
				})
				.returning();

			if (!row) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to record page version",
				});
			}

			await attachFiles({
				tx,
				pageVersionId: row.id,
				fileIds: input.fileIds ?? [],
				organizationId,
				userId,
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
	} catch (error) {
		if (uploadedUrl) {
			await del(uploadedUrl).catch((cleanupError) => {
				console.error("[pages] failed to clean up orphaned blob", {
					url: uploadedUrl,
					cleanupError,
				});
			});
		}
		throw error;
	}
}

type Tx = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

/**
 * Which page is this publish updating?
 *
 * `--page <id>` is the explicit form and wins. Otherwise the workspace edge
 * answers it, which is what makes republishing the same file from the same
 * workspace add a version. Neither resolving means we are creating a new page.
 */
async function resolveTargetPage({
	tx,
	input,
	organizationId,
	userId,
}: {
	tx: Tx;
	input: PublishPageInput;
	organizationId: string;
	userId: string;
}): Promise<SelectPage | null> {
	if (input.pageId) {
		const [page] = await tx
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
			throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
		}
		// An explicit --page must not reach someone else's private page.
		assertPageReadable(page, userId);
		return page;
	}

	if (input.workspaceId && input.entryPath) {
		const [row] = await tx
			.select({ page: pages })
			.from(workspacePages)
			.innerJoin(pages, eq(pages.id, workspacePages.pageId))
			.where(
				and(
					eq(workspacePages.workspaceId, input.workspaceId),
					eq(workspacePages.entryPath, input.entryPath),
					eq(pages.organizationId, organizationId),
				),
			)
			.limit(1);
		if (row?.page) assertPageReadable(row.page, userId);
		return row?.page ?? null;
	}

	return null;
}

/**
 * Metadata flags update the page when passed and leave it alone when omitted.
 * The slug is never among them: it is minted once and frozen, so a retitle
 * moves the display name and never a link someone already shared.
 */
async function applyMetadata({
	tx,
	page,
	input,
}: {
	tx: Tx;
	page: SelectPage;
	input: PublishPageInput;
}): Promise<SelectPage> {
	const patch: Partial<SelectPage> = {};
	if (input.title !== undefined) patch.title = input.title;
	if (input.description !== undefined) patch.description = input.description;
	if (input.visibility !== undefined) patch.visibility = input.visibility;
	if (Object.keys(patch).length === 0) return page;

	const [updated] = await tx
		.update(pages)
		.set(patch)
		.where(eq(pages.id, page.id))
		.returning();
	return updated ?? page;
}

async function createPage({
	tx,
	input,
	organizationId,
	userId,
}: {
	tx: Tx;
	input: PublishPageInput;
	organizationId: string;
	userId: string;
}): Promise<SelectPage> {
	const title = input.title ?? titleFromFilename(input.filename);
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
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to create page",
		});
	}
	return page;
}

/**
 * Bind uploaded files to the version that references them.
 *
 * This is what gives a file a lifetime: the sweep collects files with no
 * attachments, so a version's assets survive exactly as long as the version
 * does. Attaching to the version rather than the page is deliberate — a
 * `shared_version` pin has to keep serving what was published, which it cannot
 * do if a later version dropping an asset frees the blob out from under it.
 */
async function attachFiles({
	tx,
	pageVersionId,
	fileIds,
	organizationId,
	userId,
}: {
	tx: Tx;
	pageVersionId: string;
	fileIds: string[];
	organizationId: string;
	userId: string;
}): Promise<void> {
	if (fileIds.length === 0) return;

	const unique = [...new Set(fileIds)];
	// Confirm every id belongs to this org before attaching. Without it a
	// caller could attach another organization's file and, through the page,
	// read bytes it was never granted.
	const owned = await tx
		.select({ id: files.id })
		.from(files)
		.where(
			and(eq(files.organizationId, organizationId), inArray(files.id, unique)),
		);

	if (owned.length !== unique.length) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "One or more files were not found",
		});
	}

	await tx
		.insert(attachments)
		.values(
			unique.map((fileId) => ({
				fileId,
				parentKind: "page_version" as const,
				parentId: pageVersionId,
				createdByUserId: userId,
			})),
		)
		.onConflictDoNothing();
}

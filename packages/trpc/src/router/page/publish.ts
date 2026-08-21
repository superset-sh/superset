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
	// rolls the page back with it.
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

			if (!input.pageId && input.workspaceId && input.entryPath) {
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
					// Defence in depth, not the gate: the bytes are world-readable
					// once the URL is known.
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

// `--page <id>` wins; otherwise the workspace edge answers it. Neither
// resolving means a new page.
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

// The slug is never patched here. The write happens even with no flags passed
// because `list` orders by updatedAt.
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

// Attached to the version, not the page: a pinned version must keep serving
// what it published, so a later version dropping an asset cannot free the blob.
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
	// Without this a caller could attach another org's file and read it through
	// the page.
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

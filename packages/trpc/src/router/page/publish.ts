import { dbWs } from "@superset/db/client";
import {
	pageCommentThreads,
	pages,
	pageVersions,
	type SelectPage,
	workspacePages,
} from "@superset/db/schema";
import { mintPageSlug } from "@superset/shared/page-slug";
import { TRPCError } from "@trpc/server";
import { del, put } from "@vercel/blob";
import { and, desc, eq } from "drizzle-orm";
import { assertPageWritable } from "./access";
import { pageUrl } from "./page-url";
import {
	isEntryPathConflict,
	isVersionConflict,
	titleFromFilename,
	validatePublishContent,
} from "./publish-rules";
import type { PublishPageInput } from "./schema";
import { assertWorkspaceAccess } from "./workspace-access";

const MAX_PUBLISH_ATTEMPTS = 5;

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
			if (!isVersionConflict(error)) throw error;
			if (attempt < MAX_PUBLISH_ATTEMPTS) continue;
			throw new TRPCError({
				code: "CONFLICT",
				message: "This page is being published from somewhere else — retry",
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
	await resolveTargetPage({ executor: dbWs, input, organizationId, userId });

	const blob = await put(
		`pages/${organizationId}/${sha256}/${input.filename}`,
		buffer,
		{
			access: "public",
			contentType: input.contentType,
			addRandomSuffix: true,
		},
	);
	const uploadedUrl: string = blob.url;

	let bodyCompleted = false;
	try {
		return await dbWs.transaction(async (tx) => {
			const existing = await resolveTargetPage({
				executor: tx,
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

			const [latest] = await tx
				.select({ version: pageVersions.version })
				.from(pageVersions)
				.where(eq(pageVersions.pageId, page.id))
				.orderBy(desc(pageVersions.version))
				.limit(1);
			const version = (latest?.version ?? 0) + 1;

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

			// A new version is not what anyone handed off, so agent activation does
			// not carry over to it. Someone has to look at the page again and hand
			// off the threads that still apply.
			await tx
				.update(pageCommentThreads)
				.set({ agentActivatedAt: null, agentActivatedByUserId: null })
				.where(eq(pageCommentThreads.pageId, page.id));

			bodyCompleted = true;
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
		if (!bodyCompleted) {
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

type Executor = Pick<Tx, "select">;

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
			throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
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
			visibility: input.visibility ?? "just_me",
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

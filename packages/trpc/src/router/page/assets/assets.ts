import { db } from "@superset/db/client";
import { attachments, files, pages, pageVersions } from "@superset/db/schema";
import { fileOriginalKey } from "@superset/shared/usercontent";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, count, eq, sql } from "drizzle-orm";
import { presignedPutUrl } from "../../../lib/r2";
import { protectedProcedure, userError } from "../../../trpc";
import { requireActiveOrgMembership } from "../../utils/active-org";
import { assertPageWritable } from "../access";
import { validateAssetPaths } from "../publish-rules";
import {
	MAX_PAGE_ASSETS,
	removePageAssetSchema,
	type UploadPageFileInput,
	uploadPageFileSchema,
} from "./schema";

/**
 * Assets stage against the page, not the version they will belong to: the
 * version does not exist until publish reserves it, and a version that
 * appeared before its own images would serve broken. Publish verifies the
 * staged bytes, snapshots them onto the version it mints, and clears the
 * staging area — so staging always means "what is new for the next version",
 * and anything unchanged is reused from the page's lineage instead.
 *
 * The page's own document takes the same presigned PUT, minus the staging: it
 * belongs to the version publish is about to mint, not to the page.
 */
export const pageAssetRouter = {
	upload: protectedProcedure
		.input(uploadPageFileSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			// A document has no page to stage against and no lineage to be reused
			// from — publish is handed its id directly.
			if (input.kind === "document") {
				return await recordUpload({ input, organizationId, userId });
			}

			const page = await loadWritablePage({
				pageId: input.pageId,
				organizationId,
				userId,
			});
			validateAssetPaths([{ path: input.path }]);

			// Before the reuse branch: a reused file still occupies a path, so
			// checking only on the upload branch would let a caller map one
			// reusable file across unlimited paths and pass the cap.
			await assertStagingHasRoom({ pageId: page.id, path: input.path });

			// The bytes may already be here: an unchanged asset on a republish, or
			// the same image at two paths. Reuse is by content hash within this
			// page's own lineage, so nothing is shared across pages by accident.
			const reused = await findReusableFile({
				pageId: page.id,
				sha256: input.sha256,
				organizationId,
			});
			if (reused) {
				await stageAsset({ pageId: page.id, path: input.path, fileId: reused });
				return { fileId: reused, upload: null };
			}

			const recorded = await recordUpload({ input, organizationId, userId });
			await stageAsset({
				pageId: page.id,
				path: input.path,
				fileId: recorded.fileId,
			});
			return recorded;
		}),

	remove: protectedProcedure
		.input(removePageAssetSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const page = await loadWritablePage({
				pageId: input.pageId,
				organizationId,
				userId: ctx.session.user.id,
			});
			await db
				.delete(attachments)
				.where(stagedAt({ pageId: page.id, path: input.path }));
			return { path: input.path };
		}),
} satisfies TRPCRouterRecord;

/**
 * The pending row and the presigned PUT — the one place either kind of file
 * is recorded. The signature covers the declared type and length, but the PUT
 * lands without us seeing it, so publish is where the bytes are checked
 * against what was declared here. An upload never claimed is swept.
 */
async function recordUpload({
	input,
	organizationId,
	userId,
}: {
	input: UploadPageFileInput;
	organizationId: string;
	userId: string;
}): Promise<{
	fileId: string;
	upload: { url: string; headers: Record<string, string> };
}> {
	const [row] = await db
		.insert(files)
		.values({
			organizationId,
			name: input.name,
			contentType: input.contentType,
			sizeBytes: input.sizeBytes,
			sha256: input.sha256,
			createdByUserId: userId,
		})
		.returning({ id: files.id });
	if (!row) {
		throw userError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to record the upload",
			i18nKey: "serverError.page.failedToRecordTheUpload",
		});
	}

	const upload = await presignedPutUrl({
		key: fileOriginalKey(row.id),
		contentType: input.contentType,
		contentLength: input.sizeBytes,
	});
	return { fileId: row.id, upload };
}

function stagedAt({ pageId, path }: { pageId: string; path: string }) {
	return and(
		eq(attachments.parentKind, "page"),
		eq(attachments.parentId, pageId),
		eq(attachments.path, path),
	);
}

async function loadWritablePage({
	pageId,
	organizationId,
	userId,
}: {
	pageId: string;
	organizationId: string;
	userId: string;
}) {
	const [page] = await db
		.select()
		.from(pages)
		.where(and(eq(pages.id, pageId), eq(pages.organizationId, organizationId)))
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

/**
 * Bytes already in this page's lineage — staged for the next version, or
 * attached to one it already published. Only `ready` files qualify: a
 * `pending` row is an upload whose bytes may never have landed.
 */
async function findReusableFile({
	pageId,
	sha256,
	organizationId,
}: {
	pageId: string;
	sha256: string;
	organizationId: string;
}): Promise<string | null> {
	const [staged] = await db
		.select({ fileId: files.id })
		.from(attachments)
		.innerJoin(files, eq(files.id, attachments.fileId))
		.where(
			and(
				eq(attachments.parentKind, "page"),
				eq(attachments.parentId, pageId),
				eq(files.sha256, sha256),
				eq(files.status, "ready"),
				eq(files.organizationId, organizationId),
			),
		)
		.limit(1);
	if (staged) return staged.fileId;

	const [published] = await db
		.select({ fileId: files.id })
		.from(attachments)
		.innerJoin(pageVersions, eq(pageVersions.id, attachments.parentId))
		.innerJoin(files, eq(files.id, attachments.fileId))
		.where(
			and(
				eq(attachments.parentKind, "page_version"),
				eq(pageVersions.pageId, pageId),
				eq(files.sha256, sha256),
				eq(files.status, "ready"),
				eq(files.organizationId, organizationId),
			),
		)
		.limit(1);
	return published?.fileId ?? null;
}

/** Replacing what a path holds is fine; growing past the cap is not. */
async function assertStagingHasRoom({
	pageId,
	path,
}: {
	pageId: string;
	path: string;
}): Promise<void> {
	const [existing] = await db
		.select({ id: attachments.id })
		.from(attachments)
		.where(stagedAt({ pageId, path }))
		.limit(1);
	if (existing) return;
	const [staged] = await db
		.select({ value: count() })
		.from(attachments)
		.where(
			and(eq(attachments.parentKind, "page"), eq(attachments.parentId, pageId)),
		);
	if ((staged?.value ?? 0) >= MAX_PAGE_ASSETS) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `A page carries at most ${MAX_PAGE_ASSETS} assets`,
		});
	}
}

/**
 * One file per path, as a single upsert onto the unique index — atomic
 * without a transaction, which matters because this runs once per asset and
 * a pooled transaction per file made a thirty-asset publish take twenty
 * seconds. Re-uploading a path repoints it; if the row it displaced pointed
 * at bytes no version references, the sweep reclaims them.
 */
async function stageAsset({
	pageId,
	path,
	fileId,
}: {
	pageId: string;
	path: string;
	fileId: string;
}): Promise<void> {
	await db
		.insert(attachments)
		.values({ fileId, parentKind: "page", parentId: pageId, path })
		.onConflictDoUpdate({
			target: [attachments.parentKind, attachments.parentId, attachments.path],
			// The unique index is partial, so the predicate has to be repeated
			// here or Postgres cannot infer which index the conflict is on.
			targetWhere: sql`${attachments.path} is not null`,
			set: { fileId },
		});
}

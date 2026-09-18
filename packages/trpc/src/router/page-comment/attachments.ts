import { db, type dbWs } from "@superset/db/client";
import { attachments, files, type SelectFile } from "@superset/db/schema";
import { MAX_COMMENT_IMAGE_BYTES } from "@superset/shared/page-comments";
import { fileOriginalKey } from "@superset/shared/usercontent";
import { and, asc, eq, inArray } from "drizzle-orm";
import { mintFileUrl, SNIFF_BYTES, sniffContentType } from "../../lib/files";
import { getObject, headObject } from "../../lib/r2";
import { userError } from "../../trpc";
import { isCommentImageType } from "./image-types";
import type { ShapedCommentAttachment } from "./shape";

/** An uploaded image, verified and carrying the type its bytes really are. */
export interface VerifiedImage {
	file: SelectFile;
	contentType: string;
}

/**
 * Holds the uploads a comment wants to attach to what `createImageUpload`
 * recorded, before the comment exists. A presigned PUT lands without the API
 * seeing it, so this is where the bytes are checked: present, at the declared
 * size, and — by sniffing, never by the declaration — an image a browser can
 * render. Scoped to the caller's own pending, unattached uploads: a file id
 * is not authority to read the file, and an id borrowed from a page's staged
 * assets has a parent already.
 */
export async function verifyCommentImages({
	fileIds,
	organizationId,
	userId,
}: {
	fileIds: string[];
	organizationId: string;
	userId: string;
}): Promise<VerifiedImage[]> {
	if (fileIds.length === 0) return [];

	const rows = await db
		.select({ file: files, attachmentId: attachments.id })
		.from(files)
		.leftJoin(attachments, eq(attachments.fileId, files.id))
		.where(
			and(
				inArray(files.id, fileIds),
				eq(files.organizationId, organizationId),
				eq(files.createdByUserId, userId),
				eq(files.status, "pending"),
			),
		);
	const byId = new Map(
		rows
			.filter((row) => row.attachmentId === null)
			.map((row) => [row.file.id, row.file]),
	);

	return await Promise.all(
		fileIds.map(async (fileId) => {
			const file = byId.get(fileId);
			if (!file || file.sizeBytes > MAX_COMMENT_IMAGE_BYTES) {
				throw userError({
					code: "NOT_FOUND",
					message: "Image not found — upload it first",
					i18nKey: "serverError.pageComment.imageNotFound",
				});
			}

			const key = fileOriginalKey(file.id);
			const head = await headObject(key);
			if (!head || head.sizeBytes !== file.sizeBytes) {
				throw userError({
					code: "BAD_REQUEST",
					message: "Attachment was not uploaded — send the bytes first",
					i18nKey: "serverError.attachment.notUploaded",
				});
			}

			const sample = await getObject(key, {
				range: `bytes=0-${SNIFF_BYTES - 1}`,
			});
			const bytes = sample
				? new Uint8Array(await sample.arrayBuffer())
				: new Uint8Array();
			const contentType = sniffContentType(bytes, file.contentType);
			if (!isCommentImageType(contentType)) {
				throw userError({
					code: "BAD_REQUEST",
					message: "Only images can be attached to a comment",
					i18nKey: "serverError.pageComment.onlyImages",
				});
			}
			return { file, contentType };
		}),
	);
}

type Tx = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

/**
 * Runs inside the comment's own transaction, so ready ⇔ attached: the flip
 * out of `pending` commits with the attachment rows or not at all, and a file
 * the sweep already claimed fails the guarded update and the whole comment.
 */
export async function attachImagesToComment(
	tx: Tx,
	{ commentId, images }: { commentId: string; images: VerifiedImage[] },
): Promise<void> {
	if (images.length === 0) return;

	await tx.insert(attachments).values(
		images.map((image) => ({
			fileId: image.file.id,
			parentKind: "comment" as const,
			parentId: commentId,
		})),
	);
	for (const image of images) {
		const [updated] = await tx
			.update(files)
			.set({ contentType: image.contentType, status: "ready" })
			.where(and(eq(files.id, image.file.id), eq(files.status, "pending")))
			.returning({ id: files.id });
		if (!updated) {
			throw userError({
				code: "BAD_REQUEST",
				message: "The image upload expired — attach it again",
				i18nKey: "serverError.pageComment.imageExpired",
			});
		}
	}
}

export async function shapeAttachments(
	images: VerifiedImage[],
): Promise<ShapedCommentAttachment[]> {
	return await Promise.all(
		images.map(async (image) => ({
			fileId: image.file.id,
			name: image.file.name,
			contentType: image.contentType,
			url: await mintFileUrl({
				id: image.file.id,
				name: image.file.name,
				contentType: image.contentType,
			}),
		})),
	);
}

/**
 * Every comment's attachments in one query, URLs minted per response — the
 * ticket in each is what authorizes the media host to serve it, and it
 * inherits this caller's page access by construction.
 */
export async function loadCommentAttachments(
	commentIds: string[],
): Promise<Map<string, ShapedCommentAttachment[]>> {
	const shaped = new Map<string, ShapedCommentAttachment[]>();
	if (commentIds.length === 0) return shaped;

	const rows = await db
		.select({ parentId: attachments.parentId, file: files })
		.from(attachments)
		.innerJoin(files, eq(files.id, attachments.fileId))
		.where(
			and(
				eq(attachments.parentKind, "comment"),
				inArray(attachments.parentId, commentIds),
			),
		)
		.orderBy(asc(attachments.createdAt));

	const entries = await Promise.all(
		rows.map(async ({ parentId, file }) => ({
			parentId,
			entry: {
				fileId: file.id,
				name: file.name,
				contentType: file.contentType,
				url: await mintFileUrl(file),
			},
		})),
	);
	for (const { parentId, entry } of entries) {
		const existing = shaped.get(parentId);
		if (existing) existing.push(entry);
		else shaped.set(parentId, [entry]);
	}
	return shaped;
}

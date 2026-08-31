import { db } from "@superset/db/client";
import { attachments, files, type SelectFile } from "@superset/db/schema";
import { fileOriginalKey, fileUrl } from "@superset/shared/usercontent";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import {
	deleteObjects,
	getObject,
	headObject,
	presignedPutUrl,
} from "../../lib/r2";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { assertParentReadable } from "./access";
import {
	createUploadSchema,
	fileIdSchema,
	listAttachmentsSchema,
} from "./schema";
import { sniffContentType } from "./sniff";
import { mediaBaseUrl, mintFileTicket } from "./storage";

const SNIFF_BYTES = 8192;

async function loadFile(
	id: string,
	organizationId: string,
): Promise<SelectFile> {
	const [row] = await db
		.select()
		.from(files)
		.where(and(eq(files.id, id), eq(files.organizationId, organizationId)))
		.limit(1);
	if (!row) {
		throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
	}
	return row;
}

/** Everything a client needs to render or cache the file, ticket attached. */
async function signedFile(row: SelectFile) {
	const ticket = await mintFileTicket(row);
	return {
		id: row.id,
		name: row.name,
		contentType: row.contentType,
		sizeBytes: row.sizeBytes,
		sha256: row.sha256,
		status: row.status,
		createdByUserId: row.createdByUserId,
		createdAt: row.createdAt,
		storageKey: fileOriginalKey(row.id),
		url: fileUrl({
			baseUrl: mediaBaseUrl(),
			fileId: row.id,
			filename: row.name,
			ticket,
		}),
	};
}

export const fileRouter = {
	/**
	 * Records the upload as `pending` and hands back a presigned PUT whose
	 * signature covers the declared type and length. Nothing is trusted yet:
	 * `complete` verifies before the file is `ready`.
	 */
	createUpload: protectedProcedure
		.input(createUploadSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
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
				.returning();
			if (!row) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to record the upload",
				});
			}
			const upload = await presignedPutUrl({
				key: fileOriginalKey(row.id),
				contentType: input.contentType,
				contentLength: input.sizeBytes,
			});
			return { id: row.id, uploadUrl: upload.url, headers: upload.headers };
		}),

	/**
	 * The gate a presigned PUT cannot be: HEAD confirms the size createUpload
	 * was told, a ranged read sniffs the real type, and only then is the file
	 * `ready`. The serve-time policy keys on the sniffed type, never the
	 * declaration.
	 */
	complete: protectedProcedure
		.input(fileIdSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const row = await loadFile(input.id, organizationId);
			if (row.createdByUserId !== userId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only the uploader can complete an upload",
				});
			}
			if (row.status === "ready") return signedFile(row);

			const key = fileOriginalKey(row.id);
			const head = await headObject(key);
			if (!head) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No bytes uploaded yet — send the file first",
				});
			}
			if (head.sizeBytes !== row.sizeBytes) {
				await deleteObjects([key]).catch(() => {});
				await db.delete(files).where(eq(files.id, row.id));
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Uploaded size does not match — start over",
				});
			}

			const sample = await getObject(key, {
				range: `bytes=0-${SNIFF_BYTES - 1}`,
			});
			const bytes = sample
				? new Uint8Array(await sample.arrayBuffer())
				: new Uint8Array();
			const contentType = sniffContentType(bytes, row.contentType);

			// Guarded on `pending`: if the sweep claimed this row mid-flight,
			// the update matches nothing and the upload starts over.
			const [updated] = await db
				.update(files)
				.set({ contentType, status: "ready" })
				.where(and(eq(files.id, row.id), eq(files.status, "pending")))
				.returning();
			if (!updated) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "The upload expired before completing — start over",
				});
			}
			return signedFile(updated);
		}),

	/** A fresh ticketed URL; access derives from a readable parent, or the uploader. */
	sign: protectedProcedure.input(fileIdSchema).query(async ({ ctx, input }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		const userId = ctx.session.user.id;
		const row = await loadFile(input.id, organizationId);
		if (row.status !== "ready") {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Upload is not complete",
			});
		}
		if (row.createdByUserId !== userId) {
			const parents = await db
				.select({
					parentKind: attachments.parentKind,
					parentId: attachments.parentId,
				})
				.from(attachments)
				.where(eq(attachments.fileId, row.id))
				.limit(20);
			let readable = false;
			for (const parent of parents) {
				try {
					await assertParentReadable({
						...parent,
						userId,
						organizationId,
					});
					readable = true;
					break;
				} catch {
					// This parent is not readable; another may be.
				}
			}
			if (!readable) {
				throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
			}
		}
		return signedFile(row);
	}),

	/** The ready files attached to one parent, each with a ticketed URL. */
	list: protectedProcedure
		.input(listAttachmentsSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			await assertParentReadable({
				parentKind: input.parentKind,
				parentId: input.parentId,
				userId,
				organizationId,
			});
			const rows = await db
				.select({ attachment: attachments, file: files })
				.from(attachments)
				.innerJoin(files, eq(files.id, attachments.fileId))
				.where(
					and(
						eq(attachments.parentKind, input.parentKind),
						eq(attachments.parentId, input.parentId),
						eq(files.status, "ready"),
						eq(files.organizationId, organizationId),
					),
				)
				.orderBy(asc(attachments.createdAt));
			return Promise.all(
				rows.map(async (row) => ({
					attachmentId: row.attachment.id,
					path: row.attachment.path,
					file: await signedFile(row.file),
				})),
			);
		}),

	delete: protectedProcedure
		.input(fileIdSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const row = await loadFile(input.id, organizationId);
			if (row.createdByUserId !== userId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only the uploader can delete a file",
				});
			}
			// A published version is immutable and `attachments.file_id`
			// cascades, so deleting an attached file would drop the attachment
			// row and the bytes while the manifest still names them — the page
			// then serves a hole. Republishing reuses one file id across every
			// version whose bytes did not change, so a single delete can empty
			// an asset out of the entire history at once.
			const attached = await db
				.select({ id: attachments.id })
				.from(attachments)
				.where(eq(attachments.fileId, row.id))
				.limit(1);
			if (attached.length > 0) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "File is in use — delete what it is attached to instead",
				});
			}
			await db.delete(files).where(eq(files.id, row.id));
			await deleteObjects([fileOriginalKey(row.id)]).catch((error) => {
				console.error("[files] failed to delete object", {
					fileId: row.id,
					error,
				});
			});
			return { id: row.id };
		}),
} satisfies TRPCRouterRecord;

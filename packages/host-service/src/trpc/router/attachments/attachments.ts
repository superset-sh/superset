import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
	assignAttachmentFileName,
	attachmentNameWithSuffix,
	WORKSPACE_ATTACHMENTS_DIR,
} from "@superset/shared/workspace-attachments";
import { TRPCError } from "@trpc/server";
import mimeTypes from "mime-types";
import { z } from "zod";
import { protectedProcedure, router } from "../../index";
import { resolveWorktreePath } from "../git/utils/resolve-worktree";
import { MAX_INLINE_ATTACHMENT_BYTES } from "./constants";
import { type CloudAttachment, downloadAttachment } from "./download";
import {
	type AttachmentMetadata,
	deleteAttachment,
	prepareAttachmentTarget,
	writeAttachment,
	writeAttachmentMetadata,
} from "./storage";

const uploadInputSchema = z.object({
	data: z.object({
		kind: z.literal("base64"),
		data: z.string().min(1),
	}),
	mediaType: z.string(),
	originalFilename: z.string().optional(),
});

const FALLBACK_MEDIA_TYPE = "application/octet-stream";

/**
 * A media type the store can name a file with. `getAttachmentFilePath`
 * derives the extension from it and throws on one it doesn't know, so a
 * client's unrecognized type becomes the generic binary rather than a
 * failed write.
 */
function mediaTypeOf(declared: string): string {
	return mimeTypes.extension(declared) ? declared : FALLBACK_MEDIA_TYPE;
}

/**
 * A free filename in the worktree's attachment directory.
 *
 * `assignAttachmentFileName` only deduplicates within one batch — it cannot
 * see what earlier sends already wrote. The directory is long-lived and a
 * second photo named IMG_0006.jpg is ordinary, so the batch-local name is
 * only a starting point and the real directory decides.
 */
export function claimFileName({
	attachment,
	index,
	used,
	directory,
}: {
	attachment: CloudAttachment;
	index: number;
	used: Set<string>;
	directory: string;
}): string {
	const base = assignAttachmentFileName({
		rawName: attachment.name,
		index,
		used,
	});
	for (let attempt = 0; ; attempt++) {
		const candidate = attachmentNameWithSuffix(base, attempt);
		if (!existsSync(join(directory, candidate))) {
			used.add(candidate.toLowerCase());
			return candidate;
		}
	}
}

/**
 * Cheap size estimate from a base64 string without allocating the
 * decoded buffer. Used to reject oversized uploads before Buffer.from
 * spikes memory.
 */
function estimateDecodedBase64Bytes(value: string): number {
	const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
	return Math.floor((value.length * 3) / 4) - padding;
}

export const attachmentsRouter = router({
	/**
	 * Upload a single attachment to per-org host storage. Returns an
	 * opaque `attachmentId` callers reference in agent prompts. The
	 * renderer never sees the on-disk path.
	 */
	upload: protectedProcedure.input(uploadInputSchema).mutation(({ input }) => {
		const mediaType = mediaTypeOf(input.mediaType);

		// Reject before allocating the decoded buffer so a 1GB base64
		// payload doesn't spike host memory only to be rejected at the end.
		if (
			estimateDecodedBase64Bytes(input.data.data) > MAX_INLINE_ATTACHMENT_BYTES
		) {
			throw new TRPCError({
				code: "PAYLOAD_TOO_LARGE",
				message: `Attachment exceeds ${MAX_INLINE_ATTACHMENT_BYTES} bytes`,
			});
		}

		// Buffer.from(..., "base64") never throws on invalid input — it
		// silently drops unrecognized characters. We rely on bytes.length
		// (post-decode) to catch payloads that decode to nothing.
		const bytes = Buffer.from(input.data.data, "base64");
		if (bytes.length === 0) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Attachment is empty",
			});
		}

		const metadata: AttachmentMetadata = {
			attachmentId: randomUUID(),
			mediaType,
			originalFilename: input.originalFilename,
			sizeBytes: bytes.length,
			createdAt: Date.now(),
		};

		// Buffer already extends Uint8Array; no need to wrap.
		writeAttachment(bytes, metadata);

		return {
			attachmentId: metadata.attachmentId,
			originalFilename: metadata.originalFilename,
			mediaType: metadata.mediaType,
			sizeBytes: metadata.sizeBytes,
		};
	}),

	/**
	 * Pulls uploads the client sent to cloud storage into this host's
	 * attachment store, returning the ids the agent launch flow already
	 * speaks. The client PUT them straight to R2, so bytes reach the host
	 * without crossing the relay — which caps a request body far below what
	 * an attachment can legitimately be.
	 */
	importFromCloud: protectedProcedure
		.input(z.object({ fileIds: z.array(z.string().uuid()).min(1).max(10) }))
		.mutation(async ({ ctx, input }) => {
			const resolved = await ctx.api.attachment.resolve.mutate({
				fileIds: input.fileIds,
			});

			const results: AttachmentUploadResult[] = [];
			for (const attachment of resolved) {
				const metadata: AttachmentMetadata = {
					attachmentId: randomUUID(),
					mediaType: mediaTypeOf(attachment.contentType),
					originalFilename: attachment.name,
					sizeBytes: attachment.sizeBytes,
					createdAt: Date.now(),
				};
				await downloadAttachment(attachment, prepareAttachmentTarget(metadata));
				writeAttachmentMetadata(metadata);
				results.push({
					attachmentId: metadata.attachmentId,
					originalFilename: metadata.originalFilename,
					mediaType: metadata.mediaType,
					sizeBytes: metadata.sizeBytes,
				});
			}
			return results;
		}),

	/**
	 * Writes cloud uploads into a workspace's worktree and returns the
	 * worktree-relative paths an agent is handed. A live PTY only takes
	 * bytes, so paths are how an attachment reaches the agent there.
	 */
	materializeIntoWorkspace: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				fileIds: z.array(z.string().uuid()).min(1).max(10),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const directory = join(worktreePath, WORKSPACE_ATTACHMENTS_DIR);
			mkdirSync(directory, { recursive: true });

			const resolved = await ctx.api.attachment.resolve.mutate({
				fileIds: input.fileIds,
			});

			const used = new Set<string>();
			const paths: string[] = [];
			for (const [index, attachment] of resolved.entries()) {
				const fileName = claimFileName({
					attachment,
					index,
					used,
					directory,
				});
				await downloadAttachment(attachment, join(directory, fileName));
				paths.push(`${WORKSPACE_ATTACHMENTS_DIR}/${fileName}`);
			}
			return { paths };
		}),

	/**
	 * Delete an attachment by id. Idempotent — succeeds whether or not
	 * the directory still exists. Treat as cleanup; don't rely on it to
	 * confirm the row was present.
	 */
	delete: protectedProcedure
		.input(z.object({ attachmentId: z.string().uuid() }))
		.mutation(({ input }) => {
			deleteAttachment(input.attachmentId);
			return { success: true as const };
		}),
});

export type AttachmentUploadResult = {
	attachmentId: string;
	originalFilename?: string;
	mediaType: string;
	sizeBytes: number;
};

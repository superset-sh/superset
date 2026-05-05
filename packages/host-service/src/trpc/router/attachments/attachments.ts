import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import mimeTypes from "mime-types";
import { z } from "zod";
import { protectedProcedure, router } from "../../index";
import { MAX_ATTACHMENT_BYTES } from "./constants";
import {
	type AttachmentMetadata,
	deleteAttachment,
	writeAttachment,
} from "./storage";

const uploadInputSchema = z.object({
	data: z.object({
		kind: z.literal("base64"),
		data: z.string().min(1),
	}),
	mediaType: z.string().min(1),
	originalFilename: z.string().optional(),
});

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
		if (!mimeTypes.extension(input.mediaType)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Unrecognized media type: ${input.mediaType}`,
			});
		}

		// Reject before allocating the decoded buffer so a 1GB base64
		// payload doesn't spike host memory only to be rejected at the end.
		if (estimateDecodedBase64Bytes(input.data.data) > MAX_ATTACHMENT_BYTES) {
			throw new TRPCError({
				code: "PAYLOAD_TOO_LARGE",
				message: `Attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes`,
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
			mediaType: input.mediaType,
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

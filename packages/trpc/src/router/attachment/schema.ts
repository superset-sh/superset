import {
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS,
} from "@superset/shared/attachment-limits";
import { z } from "zod";

export const createAttachmentUploadSchema = z.object({
	name: z.string().min(1).max(255),
	contentType: z.string().min(1).max(255),
	sizeBytes: z
		.number()
		.int()
		.positive()
		.max(
			MAX_ATTACHMENT_BYTES,
			`An attachment is at most ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB`,
		),
});

export const resolveAttachmentsSchema = z.object({
	fileIds: z.array(z.string().uuid()).min(1).max(MAX_ATTACHMENTS),
});

export type CreateAttachmentUploadInput = z.infer<
	typeof createAttachmentUploadSchema
>;

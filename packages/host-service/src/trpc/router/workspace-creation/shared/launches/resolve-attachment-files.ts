import type { AttachmentFile } from "@superset/launch-context";
import { readAttachment } from "../../../attachments/storage";

/**
 * Read attachment bytes from the host attachment store for each id.
 * Skips ids whose data is missing on disk (deleted between upload
 * and create) — non-fatal so a stale attachment id doesn't kill the
 * whole launch.
 */
export function resolveAttachmentFiles(
	attachmentIds: string[],
): AttachmentFile[] {
	const out: AttachmentFile[] = [];
	for (const id of attachmentIds) {
		try {
			const { bytes, metadata } = readAttachment(id);
			out.push({
				data: bytes,
				mediaType: metadata.mediaType,
				filename: metadata.originalFilename,
			});
		} catch (err) {
			console.warn(
				`[launches] resolveAttachmentFiles: skipping attachment ${id} (missing on disk)`,
				err,
			);
		}
	}
	return out;
}

import type { FileUIPart } from "ai";
import { useCallback, useEffect } from "react";
import {
	awaitUploads,
	pruneAttachmentUploads,
	readyAttachmentId,
	startUpload,
} from "./store";

export interface UploadFailure {
	filename?: string;
	message: string;
}

export interface UseUploadAttachmentsApi {
	awaitUploads: () => Promise<{
		readyIds: string[];
		ready: Array<{ attachmentId: string; name: string; mimeType: string }>;
		errors: UploadFailure[];
	}>;
}

/**
 * Drives background attachment uploads. Every attached file is uploaded to
 * the current target, so switching the picker uploads the files to the new
 * target too: what the pill list shows for a target is what the create will
 * send to it. The store keys uploads by `(fileId, target)` and starts each
 * pair once, so a file never uploads twice to the same target and an earlier
 * target's upload stays cached for a return visit.
 *
 * A target is a host URL, or `CLOUD_UPLOAD_TARGET` when the workspace will be
 * a cloud one and has no host yet.
 */
export function useUploadAttachments({
	files,
	hostUrl,
}: {
	files: (FileUIPart & { id: string })[];
	hostUrl: string | null;
}): UseUploadAttachmentsApi {
	useEffect(() => {
		if (hostUrl) {
			for (const file of files) {
				startUpload(hostUrl, {
					id: file.id,
					url: file.url,
					mediaType: file.mediaType,
					filename: file.filename,
				});
			}
		}
		pruneAttachmentUploads(new Set(files.map((f) => f.id)));
	}, [files, hostUrl]);

	const awaitForCurrent = useCallback(async () => {
		if (!hostUrl) return { readyIds: [], ready: [], errors: [] };
		const result = await awaitUploads(
			hostUrl,
			files.map((f) => f.id),
		);
		const errors: UploadFailure[] = result.failures.map((failure) => {
			const file = files.find((f) => f.id === failure.fileId);
			return { filename: file?.filename, message: failure.message };
		});
		const ready = files.flatMap((file) => {
			const attachmentId = readyAttachmentId(file.id, hostUrl);
			return attachmentId
				? [
						{
							attachmentId,
							name: file.filename ?? attachmentId,
							mimeType: file.mediaType ?? "application/octet-stream",
						},
					]
				: [];
		});
		return { readyIds: result.readyIds, ready, errors };
	}, [hostUrl, files]);

	return { awaitUploads: awaitForCurrent };
}

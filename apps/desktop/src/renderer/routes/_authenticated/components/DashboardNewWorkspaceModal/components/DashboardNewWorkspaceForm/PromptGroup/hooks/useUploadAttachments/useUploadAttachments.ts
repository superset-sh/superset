import type { FileUIPart } from "ai";
import { useCallback, useEffect, useRef } from "react";
import { awaitUploads, pruneAttachmentUploads, startUpload } from "./store";

export interface UploadFailure {
	filename?: string;
	message: string;
}

export interface UseUploadAttachmentsApi {
	awaitUploads: () => Promise<{
		readyIds: string[];
		errors: UploadFailure[];
	}>;
}

/**
 * Drives background attachment uploads. Each file uploads exactly once, to
 * whichever host was active when the user added it; switching hosts does not
 * re-upload. The upload store keys results by `(fileId, hostUrl)` so the
 * visible pill list (filtered via `useFileIdsForHost`) follows the picker
 * while previous-host attachments stay cached for return visits.
 */
export function useUploadAttachments({
	files,
	hostUrl,
}: {
	files: (FileUIPart & { id: string })[];
	hostUrl: string | null;
}): UseUploadAttachmentsApi {
	// File ids we've already kicked off an upload for. Prevents re-upload on
	// host swap; keyed by fileId so a removed-and-re-added file (new id from
	// the library) does start fresh.
	const seenFileIdsRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (hostUrl) {
			for (const file of files) {
				if (seenFileIdsRef.current.has(file.id)) continue;
				seenFileIdsRef.current.add(file.id);
				startUpload(hostUrl, {
					id: file.id,
					url: file.url,
					mediaType: file.mediaType,
					filename: file.filename,
				});
			}
		}
		const liveIds = new Set(files.map((f) => f.id));
		for (const id of seenFileIdsRef.current) {
			if (!liveIds.has(id)) seenFileIdsRef.current.delete(id);
		}
		pruneAttachmentUploads(liveIds);
	}, [files, hostUrl]);

	const awaitForCurrent = useCallback(async () => {
		if (!hostUrl) return { readyIds: [], errors: [] };
		const result = await awaitUploads(
			hostUrl,
			files.map((f) => f.id),
		);
		const errors: UploadFailure[] = result.failures.map((failure) => {
			const file = files.find((f) => f.id === failure.fileId);
			return { filename: file?.filename, message: failure.message };
		});
		return { readyIds: result.readyIds, errors };
	}, [hostUrl, files]);

	return { awaitUploads: awaitForCurrent };
}

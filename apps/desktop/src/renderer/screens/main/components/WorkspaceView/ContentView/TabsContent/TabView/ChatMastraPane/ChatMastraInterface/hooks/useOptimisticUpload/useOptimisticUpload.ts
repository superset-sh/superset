import type { FileUIPart } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import { uploadFiles } from "../../utils/uploadFiles";

type AttachmentId = string;

interface UploadEntry {
	uploaded: FileUIPart | null;
	error: string | null;
	uploading: boolean;
}

/**
 * Eagerly uploads attached files to Vercel Blob as soon as they appear in the
 * attachment list.  Returns a lookup so `handleSend` can resolve the permanent
 * URLs without waiting.
 *
 * Files that fail validation on the server (unsupported type, too large) are
 * automatically removed from the attachment list and surfaced via `onError`.
 */
export function useOptimisticUpload({
	sessionId,
	attachmentFiles,
	removeAttachment,
	onError,
}: {
	sessionId: string | null;
	attachmentFiles: (FileUIPart & { id: string })[];
	removeAttachment: (id: string) => void;
	onError?: (message: string) => void;
}) {
	const [entries, setEntries] = useState<Map<AttachmentId, UploadEntry>>(
		() => new Map(),
	);
	const inflightRef = useRef<Set<AttachmentId>>(new Set());

	useEffect(() => {
		if (!sessionId) return;

		for (const file of attachmentFiles) {
			if (entries.has(file.id) || inflightRef.current.has(file.id)) continue;

			inflightRef.current.add(file.id);
			setEntries((prev) => {
				const next = new Map(prev);
				next.set(file.id, { uploaded: null, error: null, uploading: true });
				return next;
			});

			uploadFiles(sessionId, [file])
				.then(([uploaded]) => {
					setEntries((prev) => {
						const next = new Map(prev);
						next.set(file.id, {
							uploaded: uploaded ?? null,
							error: null,
							uploading: false,
						});
						return next;
					});
				})
				.catch((err: unknown) => {
					const message = err instanceof Error ? err.message : "Upload failed";
					setEntries((prev) => {
						const next = new Map(prev);
						next.set(file.id, {
							uploaded: null,
							error: message,
							uploading: false,
						});
						return next;
					});
					removeAttachment(file.id);
					onError?.(message);
				});
		}

		// Clean up entries for removed attachments
		const currentIds = new Set(attachmentFiles.map((f) => f.id));
		setEntries((prev) => {
			let changed = false;
			const next = new Map(prev);
			for (const id of next.keys()) {
				if (!currentIds.has(id)) {
					next.delete(id);
					changed = true;
				}
			}
			return changed ? next : prev;
		});
	}, [attachmentFiles, sessionId, removeAttachment, onError, entries.has]);

	const getUploadedFiles = useCallback((): {
		ready: boolean;
		files: FileUIPart[];
	} => {
		const files: FileUIPart[] = [];
		for (const file of attachmentFiles) {
			const entry = entries.get(file.id);
			if (!entry || entry.uploading) return { ready: false, files: [] };
			if (entry.error) continue;
			if (entry.uploaded) files.push(entry.uploaded);
		}
		return { ready: true, files };
	}, [attachmentFiles, entries]);

	const isUploading = attachmentFiles.some((f) => {
		const entry = entries.get(f.id);
		return entry?.uploading ?? !entries.has(f.id);
	});

	return { getUploadedFiles, isUploading, entries };
}

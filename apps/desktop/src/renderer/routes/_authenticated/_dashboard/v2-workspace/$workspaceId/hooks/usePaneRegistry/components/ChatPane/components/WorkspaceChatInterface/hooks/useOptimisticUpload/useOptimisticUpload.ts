import type { FileUIPart } from "ai";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { uploadFiles } from "../../utils/uploadFiles";

type AttachmentId = string;

interface UploadEntry {
	uploaded: FileUIPart | null;
	error: string | null;
	uploading: boolean;
}

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
	const entriesRef = useRef(entries);
	const inflightRef = useRef<Set<AttachmentId>>(new Set());
	const sessionVersionRef = useRef(0);
	const sessionIdRef = useRef(sessionId);
	const attachmentIdsRef = useRef<Set<AttachmentId>>(new Set());

	attachmentIdsRef.current = new Set(attachmentFiles.map((file) => file.id));

	useEffect(() => {
		entriesRef.current = entries;
	}, [entries]);

	useLayoutEffect(() => {
		sessionIdRef.current = sessionId;
		sessionVersionRef.current += 1;
		inflightRef.current.clear();
		entriesRef.current = new Map();
		setEntries(new Map());
	}, [sessionId]);

	useEffect(() => {
		if (!sessionId) return;

		const sessionVersion = sessionVersionRef.current;
		const isCurrentUpload = (attachmentId: AttachmentId): boolean =>
			sessionVersionRef.current === sessionVersion &&
			sessionIdRef.current === sessionId &&
			attachmentIdsRef.current.has(attachmentId);

		for (const file of attachmentFiles) {
			if (entriesRef.current.has(file.id) || inflightRef.current.has(file.id)) {
				continue;
			}

			inflightRef.current.add(file.id);
			setEntries((previousEntries) => {
				const nextEntries = new Map(previousEntries);
				nextEntries.set(file.id, {
					uploaded: null,
					error: null,
					uploading: true,
				});
				return nextEntries;
			});

			uploadFiles(sessionId, [file])
				.then(([uploaded]) => {
					if (!uploaded) {
						throw new Error("Upload failed");
					}
					if (!isCurrentUpload(file.id)) return;

					inflightRef.current.delete(file.id);
					setEntries((previousEntries) => {
						const nextEntries = new Map(previousEntries);
						nextEntries.set(file.id, {
							uploaded,
							error: null,
							uploading: false,
						});
						return nextEntries;
					});
				})
				.catch((error: unknown) => {
					if (!isCurrentUpload(file.id)) return;

					inflightRef.current.delete(file.id);
					const message =
						error instanceof Error ? error.message : "Upload failed";
					setEntries((previousEntries) => {
						const nextEntries = new Map(previousEntries);
						nextEntries.set(file.id, {
							uploaded: null,
							error: message,
							uploading: false,
						});
						return nextEntries;
					});
					removeAttachment(file.id);
					onError?.(message);
				});
		}

		const currentIds = new Set(attachmentFiles.map((file) => file.id));
		setEntries((previousEntries) => {
			let changed = false;
			const nextEntries = new Map(previousEntries);
			for (const id of nextEntries.keys()) {
				if (!currentIds.has(id)) {
					nextEntries.delete(id);
					inflightRef.current.delete(id);
					changed = true;
				}
			}
			return changed ? nextEntries : previousEntries;
		});
	}, [attachmentFiles, onError, removeAttachment, sessionId]);

	const getUploadedFiles = useCallback((): {
		ready: boolean;
		files: FileUIPart[];
	} => {
		const files: FileUIPart[] = [];
		for (const file of attachmentFiles) {
			const entry = entries.get(file.id);
			if (!entry || entry.uploading) {
				return { ready: false, files: [] };
			}
			if (entry.error || !entry.uploaded) {
				return { ready: false, files: [] };
			}
			if (entry.uploaded) {
				files.push(entry.uploaded);
			}
		}
		return { ready: true, files };
	}, [attachmentFiles, entries]);

	const isUploading = attachmentFiles.some((file) => {
		const entry = entries.get(file.id);
		return entry?.uploading ?? !entries.has(file.id);
	});

	return { entries, getUploadedFiles, isUploading };
}

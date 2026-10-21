import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { create } from "zustand";

export type UploadState =
	| { kind: "pending" }
	| { kind: "ready"; attachmentId: string }
	| { kind: "error"; message: string };

interface UploadStoreState {
	// Outer key: fileId. Inner key: hostUrl. Nested so we can prune by
	// fileId without parsing a composite string key.
	entries: Record<string, Record<string, UploadState>>;
}

export const useAttachmentUploadsStore = create<UploadStoreState>(() => ({
	entries: {},
}));

// Promises live outside the store — they aren't serializable and aren't
// observed by React. Keyed identically to entries: outer fileId, inner hostUrl.
const promiseMap = new Map<string, Map<string, Promise<UploadState>>>();

/**
 * The target of an upload when there is no host to send it to: a cloud
 * workspace's sandbox does not exist until after the create. Bytes go to
 * cloud storage instead, and the id a `ready` entry carries is a `files.id`
 * the API resolves, not a host attachment id.
 */
export const CLOUD_UPLOAD_TARGET = "cloud";

async function uploadToCloud(file: File): Promise<string> {
	const { fileId, upload } = await apiTrpcClient.attachment.createUpload.mutate(
		{
			name: file.name || "attachment",
			contentType: file.type,
			sizeBytes: file.size,
		},
	);
	const response = await fetch(upload.url, {
		method: "PUT",
		headers: upload.headers,
		body: file,
	});
	if (!response.ok) {
		throw new Error(`Upload failed (${response.status})`);
	}
	return fileId;
}

async function toBase64(file: File): Promise<string> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	let binary = "";
	for (let i = 0; i < bytes.length; i += 1) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

function setEntry(fileId: string, hostUrl: string, state: UploadState): void {
	useAttachmentUploadsStore.setState((s) => ({
		entries: {
			...s.entries,
			[fileId]: { ...(s.entries[fileId] ?? {}), [hostUrl]: state },
		},
	}));
}

export interface StartUploadInput {
	id: string;
	file: File;
}

/**
 * Idempotent: if an upload for `(hostUrl, file.id)` is already in flight or
 * settled, this is a no-op. The store only persists the upload status; the
 * composer keeps the file itself.
 */
export function startUpload(hostUrl: string, file: StartUploadInput): void {
	let byHost = promiseMap.get(file.id);
	if (byHost?.has(hostUrl)) return;
	if (!byHost) {
		byHost = new Map();
		promiseMap.set(file.id, byHost);
	}

	setEntry(file.id, hostUrl, { kind: "pending" });

	const promise = (async (): Promise<UploadState> => {
		try {
			const attachmentId =
				hostUrl === CLOUD_UPLOAD_TARGET
					? await uploadToCloud(file.file)
					: (
							await getHostServiceClientByUrl(
								hostUrl,
							).attachments.upload.mutate({
								data: { kind: "base64", data: await toBase64(file.file) },
								mediaType: file.file.type,
								originalFilename: file.file.name || undefined,
							})
						).attachmentId;
			const next: UploadState = {
				kind: "ready",
				attachmentId,
			};
			setEntry(file.id, hostUrl, next);
			return next;
		} catch (err) {
			const next: UploadState = {
				kind: "error",
				message: err instanceof Error ? err.message : String(err),
			};
			setEntry(file.id, hostUrl, next);
			return next;
		}
	})();
	byHost.set(hostUrl, promise);
}

/**
 * Resolves once every requested `(hostUrl, fileId)` upload has settled.
 * Returns ready ids and failures keyed back to fileId so callers can join
 * with the prompt-input library's metadata for messaging.
 */
export async function awaitUploads(
	hostUrl: string,
	fileIds: string[],
): Promise<{
	readyIds: string[];
	failures: { fileId: string; message: string }[];
}> {
	const tasks: { fileId: string; promise: Promise<UploadState> }[] = [];
	for (const fileId of fileIds) {
		const promise = promiseMap.get(fileId)?.get(hostUrl);
		if (promise) tasks.push({ fileId, promise });
	}
	const settled = await Promise.all(tasks.map((t) => t.promise));
	const readyIds: string[] = [];
	const failures: { fileId: string; message: string }[] = [];
	settled.forEach((state, i) => {
		if (state.kind === "ready") readyIds.push(state.attachmentId);
		else if (state.kind === "error") {
			failures.push({ fileId: tasks[i].fileId, message: state.message });
		}
	});
	return { readyIds, failures };
}

export function readyAttachmentId(
	fileId: string,
	hostUrl: string,
): string | null {
	const entry = useAttachmentUploadsStore.getState().entries[fileId]?.[hostUrl];
	return entry?.kind === "ready" ? entry.attachmentId : null;
}

/**
 * Drops cached upload state for any fileId not in `liveFileIds`. Called by
 * the hook on every re-render so the store stays a strict downstream of the
 * prompt-input library's `attachments.files` — clearing the library
 * automatically empties the store on the next effect tick.
 */
export function pruneAttachmentUploads(liveFileIds: Set<string>): void {
	for (const fileId of promiseMap.keys()) {
		if (!liveFileIds.has(fileId)) promiseMap.delete(fileId);
	}
	useAttachmentUploadsStore.setState((s) => {
		const next: Record<string, Record<string, UploadState>> = {};
		for (const [fileId, byHost] of Object.entries(s.entries)) {
			if (liveFileIds.has(fileId)) next[fileId] = byHost;
		}
		return { entries: next };
	});
}

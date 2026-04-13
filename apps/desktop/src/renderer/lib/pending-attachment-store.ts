/**
 * IndexedDB store for pending workspace attachment blobs.
 * Blobs are keyed by `${pendingId}/${index}` and stored raw (no compression).
 */

const DB_NAME = "superset-pending-attachments";
const STORE_NAME = "blobs";
const DB_VERSION = 1;

interface StoredAttachment {
	blob: Blob;
	mediaType: string;
	filename: string;
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Store attachment blobs from the PromptInput into IndexedDB.
 * Call before closing the modal so blobs survive for retry.
 */
export async function storeAttachments(
	pendingId: string,
	files: Array<{ url: string; mediaType: string; filename?: string }>,
): Promise<void> {
	if (files.length === 0) return;

	const db = await openDb();
	const store = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);

	await Promise.all(
		files.map(async (file) => {
			const blobId = crypto.randomUUID();
			const response = await fetch(file.url);
			const blob = await response.blob();
			const value: StoredAttachment = {
				blob,
				mediaType: file.mediaType,
				filename: file.filename ?? "attachment",
			};
			return new Promise<void>((resolve, reject) => {
				const request = store.put(value, `${pendingId}/${blobId}`);
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
			});
		}),
	);

	db.close();
}

/**
 * Load stored attachment blobs and convert them to data URLs
 * for the API payload. Used on retry.
 */
export async function loadAttachments(
	pendingId: string,
): Promise<Array<{ data: string; mediaType: string; filename: string }>> {
	const db = await openDb();
	const store = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME);

	const entries: StoredAttachment[] = await new Promise((resolve, reject) => {
		const prefix = `${pendingId}/`;
		const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
		const request = store.openCursor(range);
		const results: StoredAttachment[] = [];

		request.onsuccess = () => {
			const cursor = request.result;
			if (!cursor) {
				resolve(results);
				return;
			}
			results.push(cursor.value as StoredAttachment);
			cursor.continue();
		};
		request.onerror = () => reject(request.error);
	});

	db.close();

	return Promise.all(
		entries.map(async (entry) => ({
			data: await blobToDataUrl(entry.blob),
			mediaType: entry.mediaType,
			filename: entry.filename,
		})),
	);
}

/**
 * Delete all stored attachments for a pending workspace.
 * Call on create success or dismiss.
 */
export async function clearAttachments(pendingId: string): Promise<void> {
	const db = await openDb();
	const store = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME);

	await new Promise<void>((resolve, reject) => {
		const prefix = `${pendingId}/`;
		const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
		const request = store.openCursor(range);

		request.onsuccess = () => {
			const cursor = request.result;
			if (!cursor) {
				resolve();
				return;
			}
			cursor.delete();
			cursor.continue();
		};
		request.onerror = () => reject(request.error);
	});

	db.close();
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result as string);
		reader.onerror = () => reject(new Error("Failed to read blob"));
		reader.readAsDataURL(blob);
	});
}

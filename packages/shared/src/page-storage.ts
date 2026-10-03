export const STORAGE_FRAME_CHANNEL = "superset-storage/frame";
export const STORAGE_HOST_CHANNEL = "superset-storage/host";

export const MAX_PAGE_STORAGE_VALUE_BYTES = 64 * 1024;
export const MAX_PAGE_STORAGE_KEYS_PER_USER = 500;
export const MAX_PAGE_STORAGE_BYTES = 4 * 1024 * 1024;
export const MAX_PAGE_STORAGE_KEY_LENGTH = 128;

export const PAGE_STORAGE_TICKET_SECONDS = 60;

export type PageStorageErrorCode =
	| "unavailable"
	| "unauthenticated"
	| "quota_exceeded"
	| "rate_limited"
	| "invalid"
	| "revoked";

export interface PageStorageViewer {
	userId: string;
	name: string;
	image: string | null;
}

export interface PageStorageRecord {
	userId: string;
	name: string;
	image: string | null;
	value: unknown;
	updatedAt: string;
}

export type PageStorageOp =
	| { op: "get"; key: string }
	| { op: "getAll"; key: string }
	| { op: "set"; key: string; value: unknown }
	| { op: "remove"; key: string };

export type PageStorageResult =
	| { op: "get"; value: unknown }
	| { op: "getAll"; records: PageStorageRecord[] }
	| { op: "set" }
	| { op: "remove" };

export type PageStorageSocketCall = {
	type: "call";
	id: string;
	request: PageStorageOp;
};

export type PageStorageSocketMessage =
	| {
			type: "hello";
			viewer: PageStorageViewer;
			author: boolean;
			writable: boolean;
	  }
	| { type: "result"; id: string; ok: true; result: PageStorageResult }
	| {
			type: "result";
			id: string;
			ok: false;
			code: PageStorageErrorCode;
			message: string;
	  }
	| { type: "records"; key: string; records: PageStorageRecord[] }
	| { type: "revoked" };

export type PageStorageHostMessage = {
	channel: typeof STORAGE_HOST_CHANNEL;
	type: "connect";
	url: string;
};

export type PageStorageFrameMessage =
	| { channel: typeof STORAGE_FRAME_CHANNEL; type: "hello" }
	| {
			channel: typeof STORAGE_FRAME_CHANNEL;
			type: "call";
			id: string;
			request: PageStorageOp;
	  };

export function pageStorageValueBytes(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value ?? null)).length;
}

export interface PageStorageUsage {
	totalBytes: number;
	keysForUser: number;
	replacingBytes: number;
	replacingExisting: boolean;
}

export type PageStorageRefusal = {
	code: "quota_exceeded";
	message: string;
};

export function pageStorageValueRefusal(
	sizeBytes: number,
): PageStorageRefusal | null {
	if (sizeBytes > MAX_PAGE_STORAGE_VALUE_BYTES) {
		return {
			code: "quota_exceeded",
			message: `quota_exceeded: a stored value is at most ${MAX_PAGE_STORAGE_VALUE_BYTES} bytes`,
		};
	}
	return null;
}

export function pageStorageRefusal(
	usage: PageStorageUsage,
	sizeBytes: number,
): PageStorageRefusal | null {
	const tooLarge = pageStorageValueRefusal(sizeBytes);
	if (tooLarge) return tooLarge;
	if (
		!usage.replacingExisting &&
		usage.keysForUser >= MAX_PAGE_STORAGE_KEYS_PER_USER
	) {
		return {
			code: "quota_exceeded",
			message: `quota_exceeded: at most ${MAX_PAGE_STORAGE_KEYS_PER_USER} keys per person on a page`,
		};
	}
	const totalAfter = usage.totalBytes - usage.replacingBytes + sizeBytes;
	if (totalAfter > MAX_PAGE_STORAGE_BYTES) {
		return {
			code: "quota_exceeded",
			message: `quota_exceeded: a page stores at most ${MAX_PAGE_STORAGE_BYTES} bytes`,
		};
	}
	return null;
}

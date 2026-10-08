export interface PageCursor {
	path: string;
	x: number;
	y: number;
}

export interface PagePresenceViewer {
	id: string;
	userId: string;
	name: string;
	image: string | null;
	guest: boolean;
	cursor: PageCursor | null;
}

export interface PageCursorPoint {
	id: string;
	x: number;
	y: number;
}

export const MAX_PAGE_CURSOR_PATH_LENGTH = 1024;
export const MAX_PAGE_GUESTS = 20;
export const PAGE_CURSOR_SEND_INTERVAL_MS = 60;

const CURSOR_PATH =
	/^(?:[a-z][a-z0-9-]*:nth-of-type\(\d{1,6}\)(?: > [a-z][a-z0-9-]*:nth-of-type\(\d{1,6}\))*)?$/;

export function parsePageCursor(raw: unknown): PageCursor | null | undefined {
	if (raw === null) return null;
	if (!raw || typeof raw !== "object") return undefined;
	const { path, x, y } = raw as Record<string, unknown>;
	if (
		typeof path !== "string" ||
		path.length > MAX_PAGE_CURSOR_PATH_LENGTH ||
		!CURSOR_PATH.test(path) ||
		typeof x !== "number" ||
		typeof y !== "number" ||
		!Number.isFinite(x) ||
		!Number.isFinite(y)
	) {
		return undefined;
	}
	return {
		path,
		x: Math.min(Math.max(x, 0), 1),
		y: Math.min(Math.max(y, 0), 1),
	};
}

const PRESENCE_COLORS = [
	"#2563eb",
	"#db2777",
	"#7c3aed",
	"#ea580c",
	"#059669",
	"#dc2626",
	"#0891b2",
	"#65a30d",
];

export function presenceColor(userId: string): string {
	let hash = 0;
	for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
	return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length] as string;
}

export function presenceViewersFrom(raw: unknown): PagePresenceViewer[] {
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((viewer) =>
		typeof viewer?.id === "string" &&
		typeof viewer.userId === "string" &&
		typeof viewer.name === "string"
			? [
					{
						id: viewer.id,
						userId: viewer.userId,
						name: viewer.name,
						guest: viewer.guest === true,
						image:
							typeof viewer.image === "string" &&
							viewer.image.startsWith("https:")
								? viewer.image
								: null,
						cursor: null,
					},
				]
			: [],
	);
}

export function cursorPointsFrom(raw: unknown): PageCursorPoint[] {
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((cursor) =>
		typeof cursor?.id === "string" &&
		Number.isFinite(cursor.x) &&
		Number.isFinite(cursor.y)
			? [{ id: cursor.id, x: cursor.x, y: cursor.y }]
			: [],
	);
}

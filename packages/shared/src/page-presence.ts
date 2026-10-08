export interface PagePresenceViewer {
	id: string;
	userId: string;
	name: string;
	image: string | null;
	guest: boolean;
	guestNumber: number | null;
}

export const MAX_PAGE_GUESTS = 20;

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
						guestNumber:
							Number.isInteger(viewer.guestNumber) && viewer.guestNumber > 0
								? viewer.guestNumber
								: null,
						image:
							typeof viewer.image === "string" &&
							viewer.image.startsWith("https:")
								? viewer.image
								: null,
					},
				]
			: [],
	);
}

export function pagePresenceUrl({
	realtimeUrl,
	pageId,
	token,
	guestId,
}: {
	realtimeUrl: string;
	pageId: string;
	token?: string;
	guestId?: string;
}): string {
	const url = new URL(
		`/v2/page/${encodeURIComponent(pageId)}/presence`,
		realtimeUrl.replace(/^http/, "ws"),
	);
	if (token) url.searchParams.set("token", token);
	if (guestId) url.searchParams.set("guest", guestId);
	return url.toString();
}

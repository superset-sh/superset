/**
 * The realtime channel carries invalidations, never data: the API tells an
 * organization's subscribers that a kind of thing changed, and they refetch.
 */
export const REALTIME_NUDGE_KINDS = ["hosts", "cloud_workspaces"] as const;

export type RealtimeNudgeKind = (typeof REALTIME_NUDGE_KINDS)[number];

export interface RealtimeNudgeMessage {
	type: "nudge";
	kinds: RealtimeNudgeKind[];
}

export function isRealtimeNudgeKind(
	value: unknown,
): value is RealtimeNudgeKind {
	return (
		typeof value === "string" &&
		(REALTIME_NUDGE_KINDS as readonly string[]).includes(value)
	);
}

export function parseRealtimeNudgeMessage(
	raw: unknown,
): RealtimeNudgeMessage | null {
	if (typeof raw !== "string") return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (
		typeof parsed !== "object" ||
		parsed === null ||
		(parsed as { type?: unknown }).type !== "nudge" ||
		!Array.isArray((parsed as { kinds?: unknown }).kinds)
	) {
		return null;
	}
	const kinds = (parsed as { kinds: unknown[] }).kinds.filter(
		isRealtimeNudgeKind,
	);
	return { type: "nudge", kinds };
}

/** Subscribe path for an organization's nudges, relative to the realtime origin. */
export function realtimeNudgesPath(organizationId: string): string {
	return `/v2/org/${encodeURIComponent(organizationId)}/nudges`;
}

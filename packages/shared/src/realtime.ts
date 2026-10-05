import { type ActiveAgentStatus, isActiveAgentStatus } from "./agent-status";

// A change that fits in a patch never turns into a refetch.
export const REALTIME_NUDGE_KINDS = [
	"hosts",
	"cloud_workspaces",
	"automation_runs",
] as const;

export type RealtimeNudgeKind = (typeof REALTIME_NUDGE_KINDS)[number];

/** Someone who has opened the workspace; `lastSeenAt` is epoch ms. */
export interface RealtimeCloudWorkspacePresence {
	userId: string;
	name: string;
	image: string | null;
	lastSeenAt: number;
}

/** A patch to one listed row: each field present replaces the row's. */
export interface RealtimeCloudWorkspaceUpdate {
	kind: "cloud_workspaces";
	workspaceId: string;
	agentStatus?: ActiveAgentStatus | null;
	agentStatusAt?: number;
	presence?: RealtimeCloudWorkspacePresence[];
}

export type RealtimeUpdate = RealtimeCloudWorkspaceUpdate;

/** The newest sighting of each person wins, so updates can land in any order. */
export function mergePresenceByUser<Person extends { userId: string }>(
	current: readonly Person[],
	incoming: readonly Person[],
	seenAt: (person: Person) => number,
): Person[] {
	const byUser = new Map(current.map((person) => [person.userId, person]));
	for (const person of incoming) {
		const existing = byUser.get(person.userId);
		if (!existing || seenAt(person) >= seenAt(existing)) {
			byUser.set(person.userId, person);
		}
	}
	return [...byUser.values()].sort(
		(left, right) => seenAt(right) - seenAt(left),
	);
}

export interface RealtimeNudgeMessage {
	type: "nudge";
	kinds: RealtimeNudgeKind[];
	updates: RealtimeUpdate[];
}

export function isRealtimeNudgeKind(
	value: unknown,
): value is RealtimeNudgeKind {
	return (
		typeof value === "string" &&
		(REALTIME_NUDGE_KINDS as readonly string[]).includes(value)
	);
}

function isRealtimePresence(
	value: unknown,
): value is RealtimeCloudWorkspacePresence {
	if (typeof value !== "object" || value === null) return false;
	const person = value as Record<string, unknown>;
	return (
		typeof person.userId === "string" &&
		typeof person.name === "string" &&
		(person.image === null || typeof person.image === "string") &&
		typeof person.lastSeenAt === "number"
	);
}

export function isRealtimeUpdate(value: unknown): value is RealtimeUpdate {
	if (typeof value !== "object" || value === null) return false;
	const update = value as Record<string, unknown>;
	if (
		update.kind !== "cloud_workspaces" ||
		typeof update.workspaceId !== "string" ||
		update.workspaceId.length === 0
	) {
		return false;
	}
	const agentStatusValid =
		update.agentStatus === undefined
			? update.agentStatusAt === undefined
			: (update.agentStatus === null ||
					isActiveAgentStatus(update.agentStatus)) &&
				typeof update.agentStatusAt === "number";
	const presenceValid =
		update.presence === undefined ||
		(Array.isArray(update.presence) &&
			update.presence.every(isRealtimePresence));
	return (
		agentStatusValid &&
		presenceValid &&
		(update.agentStatus !== undefined || update.presence !== undefined)
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
	const message = parsed as { kinds: unknown[]; updates?: unknown };
	const kinds = message.kinds.filter(isRealtimeNudgeKind);
	const updates = Array.isArray(message.updates)
		? message.updates.filter(isRealtimeUpdate)
		: [];
	return { type: "nudge", kinds, updates };
}

/** Subscribe path for an organization's nudges, relative to the realtime origin. */
export function realtimeNudgesPath(organizationId: string): string {
	return `/v2/org/${encodeURIComponent(organizationId)}/nudges`;
}

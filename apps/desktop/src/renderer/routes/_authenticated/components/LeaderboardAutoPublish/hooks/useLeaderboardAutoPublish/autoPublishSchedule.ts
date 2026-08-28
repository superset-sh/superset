export const PUBLISH_INTERVAL_MS = 2 * 60 * 60 * 1000;
export const CHECK_INTERVAL_MS = 5 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_WINDOW_DAYS = 2;
const MAX_WINDOW_DAYS = 30;

export interface AutoPublishState {
	handle: string | null;
	lastPublishedAt: number;
	lastPayloadHash: string | null;
}

export const INITIAL_AUTO_PUBLISH_STATE: AutoPublishState = {
	handle: null,
	lastPublishedAt: 0,
	lastPayloadHash: null,
};

export function isPublishDue(state: AutoPublishState, now: number): boolean {
	if (state.lastPublishedAt > now) return true;
	return now - state.lastPublishedAt >= PUBLISH_INTERVAL_MS;
}

export function publishWindowDays(
	state: AutoPublishState,
	now: number,
): number {
	if (state.lastPublishedAt <= 0) return MAX_WINDOW_DAYS;
	const elapsedDays = Math.ceil(
		Math.max(0, now - state.lastPublishedAt) / DAY_MS,
	);
	return Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, elapsedDays + 1));
}

export function hashPayload(payload: {
	days: readonly unknown[];
	factoryDays: readonly unknown[];
}): string {
	const serialized = JSON.stringify([payload.days, payload.factoryDays]);
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < serialized.length; i++) {
		const ch = serialized.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 =
		Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
		Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 =
		Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
		Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return `${(h2 >>> 0).toString(16)}${(h1 >>> 0).toString(16)}`;
}

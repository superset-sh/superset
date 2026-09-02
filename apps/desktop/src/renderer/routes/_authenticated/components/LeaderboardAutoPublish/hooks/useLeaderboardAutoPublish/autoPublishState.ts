import type { AutoPublishState } from "./autoPublishSchedule";
import { INITIAL_AUTO_PUBLISH_STATE } from "./autoPublishSchedule";

const STORAGE_KEY = "leaderboard-auto-publish-v2";

export function readAutoPublishState(handle: string): AutoPublishState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return INITIAL_AUTO_PUBLISH_STATE;
		const parsed = JSON.parse(raw) as Partial<AutoPublishState>;
		if (parsed.handle !== handle) return INITIAL_AUTO_PUBLISH_STATE;
		return {
			handle,
			lastPublishedAt:
				typeof parsed.lastPublishedAt === "number" &&
				Number.isFinite(parsed.lastPublishedAt)
					? parsed.lastPublishedAt
					: 0,
			lastPayloadHash:
				typeof parsed.lastPayloadHash === "string"
					? parsed.lastPayloadHash
					: null,
		};
	} catch {
		return INITIAL_AUTO_PUBLISH_STATE;
	}
}

export function clearAutoPublishState(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		return;
	}
}

export function writeAutoPublishState(state: AutoPublishState): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		return;
	}
}

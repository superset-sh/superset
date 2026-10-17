export type SnoozePresetId =
	| "in-1-hour"
	| "in-3-hours"
	| "this-evening"
	| "tomorrow"
	| "next-week";

export interface SnoozePreset {
	id: SnoozePresetId;
	/** Epoch ms when the workspace wakes. */
	until: number;
}

const HOUR_MS = 60 * 60 * 1000;
const EVENING_HOUR = 18;
const MORNING_HOUR = 9;

function atLocalHour(base: Date, dayOffset: number, hour: number): number {
	const date = new Date(base);
	date.setDate(date.getDate() + dayOffset);
	date.setHours(hour, 0, 0, 0);
	return date.getTime();
}

export function resolveSnoozePresets(now: Date): SnoozePreset[] {
	const nowMs = now.getTime();
	const presets: SnoozePreset[] = [
		{ id: "in-1-hour", until: nowMs + HOUR_MS },
		{ id: "in-3-hours", until: nowMs + 3 * HOUR_MS },
	];
	const evening = atLocalHour(now, 0, EVENING_HOUR);
	if (evening - nowMs > HOUR_MS) {
		presets.push({ id: "this-evening", until: evening });
	}
	const tomorrow = atLocalHour(now, 1, MORNING_HOUR);
	presets.push({ id: "tomorrow", until: tomorrow });
	const daysToMonday = (8 - now.getDay()) % 7 || 7;
	const nextWeek = atLocalHour(now, daysToMonday, MORNING_HOUR);
	if (nextWeek !== tomorrow) {
		presets.push({ id: "next-week", until: nextWeek });
	}
	return presets;
}

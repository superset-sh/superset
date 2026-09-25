import {
	buildRrule,
	matchPreset,
	type PresetMatch,
	type Weekday,
} from "@superset/shared/rrule";

export type PresetKind = PresetMatch["kind"];

export interface ScheduleState {
	kind: PresetKind;
	hour: number;
	minute: number;
	day: Weekday;
	customRrule: string;
}

export const PRESET_OPTIONS: { value: PresetKind; label: string }[] = [
	{ value: "hourly", label: "Hourly" },
	{ value: "daily", label: "Daily" },
	{ value: "weekly", label: "Weekly" },
	{ value: "custom", label: "Custom" },
];

export const DAY_OPTIONS: { value: Weekday; label: string }[] = [
	{ value: "SU", label: "Sunday" },
	{ value: "MO", label: "Monday" },
	{ value: "TU", label: "Tuesday" },
	{ value: "WE", label: "Wednesday" },
	{ value: "TH", label: "Thursday" },
	{ value: "FR", label: "Friday" },
	{ value: "SA", label: "Saturday" },
];

/** Derive the picker's structured state from an RRULE string. */
export function stateFromRrule(rrule: string): ScheduleState {
	const match = matchPreset(rrule);
	const base: ScheduleState = {
		kind: match.kind,
		hour: 9,
		minute: 0,
		day: "MO",
		customRrule: "",
	};
	switch (match.kind) {
		case "daily":
			return { ...base, hour: match.hour, minute: match.minute };
		case "weekly":
			return {
				...base,
				hour: match.hour,
				minute: match.minute,
				day: match.day,
			};
		case "custom":
			return { ...base, customRrule: match.rrule };
		default:
			return base;
	}
}

/** Serialize the picker state back into an RRULE string. */
export function rruleFromState(state: ScheduleState): string {
	switch (state.kind) {
		case "hourly":
			return buildRrule({ kind: "hourly" });
		case "daily":
			return buildRrule({
				kind: "daily",
				hour: state.hour,
				minute: state.minute,
			});
		case "weekly":
			return buildRrule({
				kind: "weekly",
				day: state.day,
				hour: state.hour,
				minute: state.minute,
			});
		case "custom":
			return state.customRrule.trim();
	}
}

export function formatTimeInputValue(hour: number, minute: number): string {
	return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseTimeInputValue(
	value: string,
): { hour: number; minute: number } | null {
	const [h, m] = value.split(":");
	const hour = Number.parseInt(h ?? "", 10);
	const minute = Number.parseInt(m ?? "", 10);
	if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
	return { hour, minute };
}

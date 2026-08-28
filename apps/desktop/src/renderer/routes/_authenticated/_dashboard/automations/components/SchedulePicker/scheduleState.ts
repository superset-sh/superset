import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
	buildRrule,
	matchPreset,
	type PresetMatch,
	type Weekday,
} from "@superset/shared/rrule";

export type PresetKind = PresetMatch["kind"];

export interface SchedulePickerState {
	kind: PresetKind;
	hour: number;
	minute: number;
	day: Weekday;
	customRrule: string;
}

export const PRESET_OPTIONS: { value: PresetKind; label: MessageDescriptor }[] =
	[
		{
			value: "hourly",
			label: msg({
				id: "dashboard.automations.schedule.presetHourly",
				message: "Hourly",
			}),
		},
		{
			value: "daily",
			label: msg({
				id: "dashboard.automations.schedule.presetDaily",
				message: "Daily",
			}),
		},
		{
			value: "weekdays",
			label: msg({
				id: "dashboard.automations.schedule.presetWeekdays",
				message: "Weekdays",
			}),
		},
		{
			value: "weekly",
			label: msg({
				id: "dashboard.automations.schedule.presetWeekly",
				message: "Weekly",
			}),
		},
		{
			value: "custom",
			label: msg({
				id: "dashboard.automations.schedule.presetCustom",
				message: "Custom",
			}),
		},
	];

export const DAY_OPTIONS: { value: Weekday; label: MessageDescriptor }[] = [
	{
		value: "MO",
		label: msg({
			id: "dashboard.automations.schedule.dayMonday",
			message: "Monday",
		}),
	},
	{
		value: "TU",
		label: msg({
			id: "dashboard.automations.schedule.dayTuesday",
			message: "Tuesday",
		}),
	},
	{
		value: "WE",
		label: msg({
			id: "dashboard.automations.schedule.dayWednesday",
			message: "Wednesday",
		}),
	},
	{
		value: "TH",
		label: msg({
			id: "dashboard.automations.schedule.dayThursday",
			message: "Thursday",
		}),
	},
	{
		value: "FR",
		label: msg({
			id: "dashboard.automations.schedule.dayFriday",
			message: "Friday",
		}),
	},
	{
		value: "SA",
		label: msg({
			id: "dashboard.automations.schedule.daySaturday",
			message: "Saturday",
		}),
	},
	{
		value: "SU",
		label: msg({
			id: "dashboard.automations.schedule.daySunday",
			message: "Sunday",
		}),
	},
];

/** Derive the picker's structured state from an RRULE string. */
export function stateFromRrule(rrule: string): SchedulePickerState {
	const match = matchPreset(rrule);
	const base: SchedulePickerState = {
		kind: match.kind,
		hour: 9,
		minute: 0,
		day: "MO",
		customRrule: "",
	};
	switch (match.kind) {
		case "daily":
		case "weekdays":
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
export function rruleFromState(state: SchedulePickerState): string {
	switch (state.kind) {
		case "hourly":
			return buildRrule({ kind: "hourly" });
		case "daily":
			return buildRrule({
				kind: "daily",
				hour: state.hour,
				minute: state.minute,
			});
		case "weekdays":
			return buildRrule({
				kind: "weekdays",
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

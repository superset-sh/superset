import type { TriggerConfigInput } from "@superset/shared/automation-triggers";
import { LuClock } from "react-icons/lu";
import { ScheduleSentence } from "../../ScheduleSentence";
import type { TriggerProvider } from "../types";

type ScheduleConfig = Extract<TriggerConfigInput, { kind: "schedule" }>;

/**
 * dtstart anchors the recurrence, so it is read when the trigger is added
 * rather than when this module loads — otherwise every schedule created in a
 * long-lived window shares the timestamp the app booted at.
 */
function createScheduleConfig(rrule: string): ScheduleConfig {
	return {
		kind: "schedule",
		rrule,
		dtstart: new Date().toISOString(),
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
	};
}

export const scheduleProvider: TriggerProvider<ScheduleConfig> = {
	kind: "schedule",
	label: "Scheduled",
	icon: LuClock,
	menu: [
		{
			label: "Hourly",
			create: () => createScheduleConfig("FREQ=HOURLY"),
		},
		{
			label: "Daily",
			create: () => createScheduleConfig("FREQ=DAILY;BYHOUR=9;BYMINUTE=0"),
		},
		{
			label: "Weekly",
			create: () =>
				createScheduleConfig("FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0"),
		},
		{
			// No preset matches this rule, so the row opens in raw-RRULE editing
			// with a valid weekdays template already in the box.
			label: "Custom",
			create: () =>
				createScheduleConfig(
					"FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0",
				),
		},
	],
	renderSentence: (config, { set, nextRun, disabled }) => (
		<ScheduleSentence
			rrule={config.rrule}
			onRruleChange={(rrule) => set({ rrule })}
			timezone={config.timezone}
			nextRun={nextRun}
			disabled={disabled}
		/>
	),
};

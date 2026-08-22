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
function createScheduleConfig(): ScheduleConfig {
	return {
		kind: "schedule",
		rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
		dtstart: new Date().toISOString(),
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
	};
}

export const scheduleProvider: TriggerProvider<ScheduleConfig> = {
	kind: "schedule",
	label: "Scheduled",
	icon: LuClock,
	menu: [{ label: "Scheduled", create: createScheduleConfig }],
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

import {
	rruleProblem,
	timezoneAbbreviation,
	type Weekday,
} from "@superset/shared/rrule";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { CHIP } from "../TriggerSentence/chipStyles";
import { SelectChip } from "../TriggerSentence/components/SelectChip";
import {
	DAY_OPTIONS,
	formatTimeInputValue,
	parseTimeInputValue,
	rruleFromState,
	type ScheduleState,
	stateFromRrule,
} from "./scheduleState";

interface ScheduleSentenceProps {
	rrule: string;
	onRruleChange: (rrule: string) => void;
	timezone: string;
	/** Trailing "Next run ..." text, shown inline at the end of the sentence. */
	nextRun?: ReactNode;
	disabled?: boolean;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => {
	const value = formatTimeInputValue(hour, 0);
	return { value, label: value };
});

/**
 * One schedule trigger as a sentence: "Every week on [Monday ▾] at [09:00 ▾]
 * PDT · Next run ...". The cadence is fixed when the trigger is added — the
 * Add Trigger menu is where Hourly vs Daily is chosen — so only the
 * parameters (day, time, custom rule) are editable here.
 */
export function ScheduleSentence({
	rrule,
	onRruleChange,
	timezone,
	nextRun,
	disabled,
}: ScheduleSentenceProps) {
	const [state, setState] = useState<ScheduleState>(() =>
		stateFromRrule(rrule),
	);
	// Resync when the rrule changes underneath us (remote edit, version
	// restore) — but not when our own emission echoes back through the row,
	// which would collapse an in-progress Custom edit into a preset.
	const lastEmittedRef = useRef(rrule);
	const [prevRrule, setPrevRrule] = useState(rrule);
	if (rrule !== prevRrule) {
		setPrevRrule(rrule);
		if (rrule !== lastEmittedRef.current) {
			lastEmittedRef.current = rrule;
			setState(stateFromRrule(rrule));
		}
	}

	const emit = (serialized: string) => {
		lastEmittedRef.current = serialized;
		onRruleChange(serialized);
	};

	const update = (patch: Partial<ScheduleState>) => {
		const next = { ...state, ...patch };
		setState(next);
		if (next.kind !== "custom") {
			emit(rruleFromState(next));
			return;
		}
		// Custom commits on every keystroke that validates — the rows are drafts
		// until "Save triggers", so this only moves the sentence's "Next run"
		// live; invalid intermediate states keep the last valid rule.
		const draft = next.customRrule.trim();
		if (draft && draft !== rrule && !rruleProblem(draft)) emit(draft);
	};

	const timeValue = formatTimeInputValue(state.hour, state.minute);
	const timeOptions = useMemo(() => {
		if (state.minute === 0) return HOUR_OPTIONS;
		// The list offers whole hours, but a rule written elsewhere (CLI, MCP)
		// can carry minutes — keep that value selectable so the chip shows it.
		const options = [...HOUR_OPTIONS];
		options.splice(state.hour + 1, 0, { value: timeValue, label: timeValue });
		return options;
	}, [state.hour, state.minute, timeValue]);

	const customDraft = state.customRrule.trim();
	const customProblem = useMemo(() => rruleProblem(customDraft), [customDraft]);
	// The saved rule itself can be exhausted (a run-once schedule that already
	// ran); that is history, not an edit gone wrong, so only a changed draft
	// gets the complaint.
	const draftEdited = customDraft !== "" && customDraft !== rrule;
	// Clearing a saved rule is an edit that cannot save, but it has no problem
	// to report — an empty field parses as nothing at all — so it needs saying
	// separately, or the row sits blank under the previous rule's next run.
	const draftCleared = customDraft === "" && rrule !== "";
	const showsProblem =
		state.kind === "custom" &&
		(draftCleared || (draftEdited && !!customProblem));

	const showsTime = state.kind === "daily" || state.kind === "weekly";

	// A fragment, not a wrapper: the row this sits in is the flex container that
	// wraps, and a nested one is a single item that cannot share a line with the
	// row's icon — it drops to its own line and takes the whole sentence with it.
	return (
		<>
			{state.kind === "hourly" && (
				<span className="text-[13px]">Every hour</span>
			)}
			{state.kind === "daily" && <span className="text-[13px]">Every day</span>}
			{state.kind === "weekly" && (
				<>
					<span className="text-[13px]">Every week</span>
					<span className="text-[13px]">on</span>
					<SelectChip
						value={state.day}
						disabled={disabled}
						options={DAY_OPTIONS}
						onChange={(value) => update({ day: value as Weekday })}
					/>
				</>
			)}

			{showsTime && (
				<>
					<span className="text-[13px]">at</span>
					<SelectChip
						value={timeValue}
						disabled={disabled}
						options={timeOptions}
						onChange={(value) => {
							const parsed = parseTimeInputValue(value);
							if (parsed) update(parsed);
						}}
					/>
					{/* Read-only: the zone is captured from the browser when the
						    trigger is created. Rebinding it to whoever is looking would
						    silently move when the automation fires — create it in Los
						    Angeles, open it from London, and an 11:00 job becomes a
						    19:00 one. */}
					<span className="text-[13px]" title={timezone.replace(/_/g, " ")}>
						{timezoneAbbreviation(timezone)}
					</span>
				</>
			)}

			{state.kind === "custom" && (
				<>
					<span className="shrink-0 text-[13px]">Custom schedule</span>
					<input
						disabled={disabled}
						placeholder="FREQ=WEEKLY;BYDAY=FR;BYHOUR=9;BYMINUTE=0"
						className={cn(
							CHIP,
							"w-72 max-w-full px-2 font-mono text-xs placeholder:text-muted-foreground",
						)}
						value={state.customRrule}
						onChange={(event) => update({ customRrule: event.target.value })}
					/>
				</>
			)}

			{/* The error takes the "Next run" slot rather than a second line: a
				    rule that won't save has no next run, and showing both at once
				    reads as a contradiction. */}
			{showsProblem ? (
				<span className="ml-1 truncate text-[13px] text-destructive">
					{draftCleared
						? "Enter a recurrence rule — changes aren't saved"
						: customProblem === "exhausted"
							? "No upcoming runs — changes aren't saved"
							: "Invalid recurrence rule — changes aren't saved"}
				</span>
			) : (
				nextRun && (
					<span className="ml-1 truncate text-[13px] text-muted-foreground">
						{nextRun}
					</span>
				)
			)}
		</>
	);
}

import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import {
	rruleProblem,
	timezoneAbbreviation,
	type Weekday,
} from "@superset/shared/rrule";
import { Input } from "@superset/ui/input";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useMemo, useRef, useState } from "react";
import {
	DAY_OPTIONS,
	formatTimeInputValue,
	PRESET_OPTIONS,
	type PresetKind,
	parseTimeInputValue,
	rruleFromState,
	type SchedulePickerState,
	stateFromRrule,
} from "../SchedulePicker/scheduleState";
import { CHIP } from "../TriggerSentence/chipStyles";
import { SelectChip } from "../TriggerSentence/components/SelectChip";

interface ScheduleSentenceProps {
	rrule: string;
	onRruleChange: (rrule: string) => void;
	timezone: string;
	/** Trailing "Next run ..." text, shown inline at the end of the sentence. */
	nextRun?: ReactNode;
	className?: string;
	disabled?: boolean;
}

/**
 * Sentence-chip schedule editor:
 * "[Daily ▾] at [8:00 AM] · Los Angeles (PDT)", decomposed into inline
 * controls instead of one opaque popover chip.
 */
export function ScheduleSentence({
	rrule,
	onRruleChange,
	timezone,
	nextRun,
	className,
	disabled,
}: ScheduleSentenceProps) {
	const [state, setState] = useState<SchedulePickerState>(() =>
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

	const update = (patch: Partial<SchedulePickerState>) => {
		const next = { ...state, ...patch };
		if (patch.kind === "custom" && state.kind !== "custom") {
			// Entering Custom mode: seed from the current saved rule (a stale
			// draft from a prior visit would silently mismatch what's persisted).
			next.customRrule = rrule;
		}
		setState(next);
		// Custom text commits on blur/Enter once it validates; presets are
		// always complete rules.
		if (next.kind !== "custom") emit(rruleFromState(next));
	};

	const customDraft = state.customRrule.trim();
	const customProblem = useMemo(() => rruleProblem(customDraft), [customDraft]);
	// The saved rule itself can be exhausted (a run-once schedule that already
	// ran); that is history, not an edit gone wrong, so only a changed draft
	// gets the complaint.
	const draftEdited = customDraft !== "" && customDraft !== rrule;

	const commitCustom = () => {
		if (!draftEdited || customProblem) return;
		emit(customDraft);
	};

	const showsDay = state.kind === "weekly";
	const showsTime =
		state.kind === "daily" ||
		state.kind === "weekdays" ||
		state.kind === "weekly";

	// The sentence is one catalog message with the controls as placeholders,
	// not fragments joined by the component: a bare "on"/"at" cannot be
	// translated into verb-final or case-marking languages, while a whole
	// message lets each locale reorder the chips and reword the connectives.
	const kindChip = (
		<SelectChip
			value={state.kind}
			disabled={disabled}
			options={PRESET_OPTIONS.map((option) => ({
				value: option.value,
				label: i18n._(option.label),
			}))}
			onChange={(value) => update({ kind: value as PresetKind })}
		/>
	);
	const daySelect = (
		<SelectChip
			value={state.day}
			disabled={disabled}
			options={DAY_OPTIONS.map((option) => ({
				value: option.value,
				label: i18n._(option.label),
			}))}
			onChange={(value) => update({ day: value as Weekday })}
		/>
	);
	const timeInput = (
		<input
			type="time"
			disabled={disabled}
			className={cn(
				CHIP,
				"px-2 disabled:opacity-50 dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden",
			)}
			value={formatTimeInputValue(state.hour, state.minute)}
			onChange={(event) => {
				const parsed = parseTimeInputValue(event.target.value);
				if (parsed) update(parsed);
			}}
		/>
	);

	return (
		<div className={cn("flex flex-col gap-1.5", className)}>
			<div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]">
				{showsDay ? (
					<Trans id="dashboard.automations.scheduleSentence.kindOnDayAtTime">
						{kindChip} <span className="text-muted-foreground">on</span>{" "}
						{daySelect} <span className="text-muted-foreground">at</span>{" "}
						{timeInput}
					</Trans>
				) : showsTime ? (
					<Trans id="dashboard.automations.scheduleSentence.kindAtTime">
						{kindChip} <span className="text-muted-foreground">at</span>{" "}
						{timeInput}
					</Trans>
				) : (
					kindChip
				)}

				{/* Read-only: the zone is captured from the browser when the trigger
				    is created. Rebinding it to whoever is looking would silently
				    move when the automation fires — create it in Los Angeles, open
				    it from London, and an 11:00 job becomes a 19:00 one. */}
				<span
					className="text-muted-foreground"
					title={timezone.replace(/_/g, " ")}
				>
					{timezoneAbbreviation(timezone)}
				</span>

				{nextRun && (
					<span className="ml-1 truncate text-muted-foreground">{nextRun}</span>
				)}
			</div>

			{state.kind === "custom" && (
				<div className="ml-[26px] flex flex-col gap-1">
					<Input
						autoFocus
						disabled={disabled}
						placeholder="FREQ=WEEKLY;BYDAY=FR;BYHOUR=9;BYMINUTE=0"
						className="h-8 w-full max-w-md font-mono text-xs"
						value={state.customRrule}
						onChange={(event) => update({ customRrule: event.target.value })}
						onBlur={commitCustom}
						onKeyDown={(event) => {
							if (event.key === "Enter") commitCustom();
						}}
					/>
					{draftEdited && customProblem && (
						<span className="select-text cursor-text text-xs text-destructive">
							{customProblem === "exhausted" ? (
								<Trans id="dashboard.automations.scheduleSentence.exhaustedRrule">
									No upcoming runs — changes aren't saved
								</Trans>
							) : (
								<Trans id="dashboard.automations.scheduleSentence.invalidRrule">
									Invalid recurrence rule — changes aren't saved
								</Trans>
							)}
						</span>
					)}
				</div>
			)}
		</div>
	);
}

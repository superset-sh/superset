import { isValidRrule, type Weekday } from "@superset/shared/rrule";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { cn } from "@superset/ui/utils";
import { useMemo, useRef, useState } from "react";
import { LuClock } from "react-icons/lu";
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
import { TimezonePicker } from "../TimezonePicker";

const CHIP =
	"w-auto min-w-0 gap-1 rounded-md border-none bg-transparent px-1.5 text-sm font-medium shadow-none hover:bg-accent focus-visible:ring-1 dark:bg-transparent dark:hover:bg-accent";

interface ScheduleSentenceProps {
	rrule: string;
	onRruleChange: (rrule: string) => void;
	timezone: string;
	onTimezoneChange: (timezone: string) => void;
	className?: string;
	disabled?: boolean;
}

/**
 * Cursor-style sentence-chip schedule editor:
 * "[Daily ▾] at [8:00 AM] · Los Angeles (PDT)", decomposed into inline
 * controls instead of one opaque popover chip.
 */
export function ScheduleSentence({
	rrule,
	onRruleChange,
	timezone,
	onTimezoneChange,
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
	const customValid = useMemo(() => isValidRrule(customDraft), [customDraft]);

	const commitCustom = () => {
		if (!customDraft || customDraft === rrule || !customValid) return;
		emit(customDraft);
	};

	const showsDay = state.kind === "weekly";
	const showsTime =
		state.kind === "daily" ||
		state.kind === "weekdays" ||
		state.kind === "weekly";

	return (
		<div className={cn("flex flex-col gap-1.5", className)}>
			<div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
				<LuClock className="mr-1.5 size-4 shrink-0 text-muted-foreground" />

				<Select
					value={state.kind}
					disabled={disabled}
					onValueChange={(value) => update({ kind: value as PresetKind })}
				>
					<SelectTrigger size="sm" className={CHIP}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{PRESET_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				{showsDay && (
					<>
						<span className="text-muted-foreground">on</span>
						<Select
							value={state.day}
							disabled={disabled}
							onValueChange={(value) => update({ day: value as Weekday })}
						>
							<SelectTrigger size="sm" className={CHIP}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{DAY_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</>
				)}

				{showsTime && (
					<>
						<span className="text-muted-foreground">at</span>
						<input
							type="time"
							disabled={disabled}
							className="h-8 rounded-md px-1.5 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-1 disabled:opacity-50 dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden"
							value={formatTimeInputValue(state.hour, state.minute)}
							onChange={(event) => {
								const parsed = parseTimeInputValue(event.target.value);
								if (parsed) update(parsed);
							}}
						/>
					</>
				)}

				<TimezonePicker
					className="text-muted-foreground"
					value={timezone}
					disabled={disabled}
					onChange={onTimezoneChange}
				/>
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
					{customDraft && !customValid && (
						<span className="select-text cursor-text text-xs text-destructive">
							Invalid recurrence rule — changes aren't saved
						</span>
					)}
				</div>
			)}
		</div>
	);
}

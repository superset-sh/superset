import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import {
	describeSchedule,
	isValidRrule,
	type Weekday,
} from "@superset/shared/rrule";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useMemo, useRef, useState } from "react";
import { LuClock } from "react-icons/lu";
import { PickerTrigger } from "renderer/components/PickerTrigger";
import {
	DAY_OPTIONS,
	formatTimeInputValue,
	PRESET_OPTIONS,
	type PresetKind,
	parseTimeInputValue,
	rruleFromState,
	type SchedulePickerState,
	stateFromRrule,
} from "./scheduleState";

interface SchedulePickerProps {
	rrule: string;
	onRruleChange: (rrule: string) => void;
	className?: string;
}

export function SchedulePicker({
	rrule,
	onRruleChange,
	className,
}: SchedulePickerProps) {
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

	const triggerLabel = useMemo(() => describeSchedule(rrule), [rrule]);

	return (
		<Popover>
			<PopoverTrigger asChild>
				<PickerTrigger
					className={className}
					icon={<LuClock className="size-4 shrink-0" />}
					label={triggerLabel}
				/>
			</PopoverTrigger>
			<PopoverContent className="w-72" align="start" side="top" sideOffset={8}>
				<div className="flex flex-col gap-3">
					<span className="text-xs font-medium text-muted-foreground">
						<Trans id="dashboard.automations.schedulePicker.schedule">
							Schedule
						</Trans>
					</span>

					<Select
						value={state.kind}
						onValueChange={(value) => update({ kind: value as PresetKind })}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PRESET_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{i18n._(option.label)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					{state.kind === "weekly" && (
						<Select
							value={state.day}
							onValueChange={(value) => update({ day: value as Weekday })}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{DAY_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{i18n._(option.label)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}

					{(state.kind === "daily" ||
						state.kind === "weekdays" ||
						state.kind === "weekly") && (
						<Input
							type="time"
							// color-scheme tells Chromium to render native controls (the
							// clock icon) in a theme-appropriate color — without it the icon
							// stays a dim gray regardless of background.
							className="dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
							value={formatTimeInputValue(state.hour, state.minute)}
							onChange={(event) => {
								const parsed = parseTimeInputValue(event.target.value);
								if (parsed) update(parsed);
							}}
						/>
					)}

					{state.kind === "custom" && (
						<div className="flex flex-col gap-1.5">
							<Input
								autoFocus
								placeholder="FREQ=WEEKLY;BYDAY=FR;BYHOUR=9;BYMINUTE=0"
								className="font-mono text-xs"
								value={state.customRrule}
								onChange={(event) =>
									update({ customRrule: event.target.value })
								}
								onBlur={commitCustom}
								onKeyDown={(event) => {
									if (event.key === "Enter") commitCustom();
								}}
							/>
							{customDraft && !customValid && (
								<span className="select-text cursor-text text-xs text-destructive">
									<Trans id="dashboard.automations.schedulePicker.invalidRrule">
										Invalid recurrence rule — changes aren't saved
									</Trans>
								</span>
							)}
							{customDraft && customValid && (
								<span className="text-xs text-muted-foreground">
									{describeSchedule(customDraft)}
								</span>
							)}
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}

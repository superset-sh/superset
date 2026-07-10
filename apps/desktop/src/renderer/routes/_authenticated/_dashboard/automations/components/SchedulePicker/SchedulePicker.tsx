import {
	buildRrule,
	describeSchedule,
	matchPreset,
	type PresetMatch,
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
import { useMemo, useState } from "react";
import { LuClock } from "react-icons/lu";
import { PickerTrigger } from "renderer/components/PickerTrigger";

type PresetKind = PresetMatch["kind"];

interface SchedulePickerState {
	kind: PresetKind;
	hour: number;
	minute: number;
	day: Weekday;
	customRrule: string;
}

interface SchedulePickerProps {
	rrule: string;
	onRruleChange: (rrule: string) => void;
	className?: string;
}

const PRESET_OPTIONS: { value: PresetKind; label: string }[] = [
	{ value: "hourly", label: "Hourly" },
	{ value: "daily", label: "Daily" },
	{ value: "weekdays", label: "Weekdays" },
	{ value: "weekly", label: "Weekly" },
	{ value: "custom", label: "Custom" },
];

const DAY_OPTIONS: { value: Weekday; label: string }[] = [
	{ value: "MO", label: "Monday" },
	{ value: "TU", label: "Tuesday" },
	{ value: "WE", label: "Wednesday" },
	{ value: "TH", label: "Thursday" },
	{ value: "FR", label: "Friday" },
	{ value: "SA", label: "Saturday" },
	{ value: "SU", label: "Sunday" },
];

/** Derive the picker's structured state from an RRULE string. */
function stateFromRrule(rrule: string): SchedulePickerState {
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
function rruleFromState(state: SchedulePickerState): string {
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

function formatTimeInputValue(hour: number, minute: number): string {
	return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseTimeInputValue(
	value: string,
): { hour: number; minute: number } | null {
	const [h, m] = value.split(":");
	const hour = Number.parseInt(h ?? "", 10);
	const minute = Number.parseInt(m ?? "", 10);
	if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
	return { hour, minute };
}

export function SchedulePicker({
	rrule,
	onRruleChange,
	className,
}: SchedulePickerProps) {
	const [state, setState] = useState<SchedulePickerState>(() =>
		stateFromRrule(rrule),
	);

	const update = (patch: Partial<SchedulePickerState>) => {
		const next = { ...state, ...patch };
		setState(next);
		onRruleChange(rruleFromState(next));
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
						Schedule
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
									{option.label}
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
										{option.label}
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
						<Input
							autoFocus
							placeholder="FREQ=WEEKLY;BYDAY=FR;BYHOUR=9;BYMINUTE=0"
							className="font-mono text-xs"
							value={state.customRrule}
							onChange={(event) => update({ customRrule: event.target.value })}
						/>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}

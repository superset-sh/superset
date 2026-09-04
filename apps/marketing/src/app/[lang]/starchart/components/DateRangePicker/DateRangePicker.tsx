"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Calendar } from "@superset/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { formatRangeLabel } from "@/app/[lang]/utils/formatRangeLabel";

interface DateRangePickerProps {
	range: DateRange | undefined;
	onRangeChange: (range: DateRange | undefined) => void;
	fromDate: Date;
	toDate: Date;
}

const PRESETS: Array<{
	id: string;
	label: MessageDescriptor;
	days: number | null;
}> = [
	{
		id: "all",
		label: msg({
			message: "All time",
		}),
		days: null,
	},
	{
		id: "4w",
		label: msg({
			message: "Last 4 weeks",
		}),
		days: 28,
	},
	{
		id: "3m",
		label: msg({
			message: "Last 3 months",
		}),
		days: 90,
	},
	{
		id: "6m",
		label: msg({
			message: "Last 6 months",
		}),
		days: 180,
	},
];

export function DateRangePicker({
	range,
	onRangeChange,
	fromDate,
	toDate,
}: DateRangePickerProps) {
	const { t } = useLingui();
	// With no selection, defaultMonth + the next month are both shown
	// (numberOfMonths={2}) — anchoring on toDate would put a fully-disabled
	// future month in the second slot, so anchor one month earlier instead.
	const defaultMonth =
		range?.from ?? new Date(toDate.getFullYear(), toDate.getMonth() - 1, 1);

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="outline" size="sm" className="gap-2 font-mono text-xs">
					<CalendarIcon className="size-3.5" />
					{formatRangeLabel(
						range,
						t({
							message: "All time",
						}),
						"MMM d, yyyy",
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-3" align="start">
				<div className="flex flex-wrap gap-1.5 pb-3 mb-3 border-b border-border">
					{PRESETS.map((preset) => (
						<Button
							key={preset.id}
							variant="ghost"
							size="sm"
							className="h-7 text-xs"
							onClick={() =>
								onRangeChange(
									preset.days === null
										? undefined
										: {
												// Clamp so a preset longer than the actual data
												// range (e.g. "Last 6 months" on newer history)
												// doesn't produce a from-date predating any real
												// data.
												from: new Date(
													Math.max(
														fromDate.getTime(),
														toDate.getTime() - preset.days * 86_400_000,
													),
												),
												to: toDate,
											},
								)
							}
						>
							{t(preset.label)}
						</Button>
					))}
				</div>
				<Calendar
					mode="range"
					selected={range}
					onSelect={onRangeChange}
					defaultMonth={defaultMonth}
					disabled={(date) => date < fromDate || date > toDate}
					numberOfMonths={2}
				/>
			</PopoverContent>
		</Popover>
	);
}

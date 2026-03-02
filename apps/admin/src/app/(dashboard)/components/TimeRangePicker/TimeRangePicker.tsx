"use client";

import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";

export type TimeRange = "-7d" | "-30d" | "-90d" | "-180d";

interface TimeRangePickerProps {
	value: TimeRange;
	onChange: (value: TimeRange) => void;
}

const TIME_RANGES: { value: TimeRange; label: string }[] = [
	{ value: "-7d", label: "7d" },
	{ value: "-30d", label: "30d" },
	{ value: "-90d", label: "90d" },
	{ value: "-180d", label: "180d" },
];

export function TimeRangePicker({ value, onChange }: TimeRangePickerProps) {
	return (
		<ToggleGroup
			type="single"
			value={value}
			onValueChange={(v) => v && onChange(v as TimeRange)}
			variant="outline"
			size="sm"
		>
			{TIME_RANGES.map((range) => (
				<ToggleGroupItem key={range.value} value={range.value}>
					{range.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}

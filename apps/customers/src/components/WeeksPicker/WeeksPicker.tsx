import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";

const RANGES = [
	{ label: "4 weeks", weeks: 4 },
	{ label: "8 weeks", weeks: 8 },
	{ label: "12 weeks", weeks: 12 },
	{ label: "6 months", weeks: 26 },
	{ label: "12 months", weeks: 52 },
] as const;

export interface WeeksPickerProps {
	value: number;
	onChange: (weeks: number) => void;
}

export function WeeksPicker({ value, onChange }: WeeksPickerProps) {
	return (
		<Select
			value={String(value)}
			onValueChange={(next) => onChange(Number(next))}
		>
			<SelectTrigger className="w-32">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{RANGES.map((range) => (
					<SelectItem key={range.weeks} value={String(range.weeks)}>
						{range.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

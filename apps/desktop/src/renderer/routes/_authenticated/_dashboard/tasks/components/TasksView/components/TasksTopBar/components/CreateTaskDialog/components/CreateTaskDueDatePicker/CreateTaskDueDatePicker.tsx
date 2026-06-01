import { Button } from "@superset/ui/button";
import { Calendar } from "@superset/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useMemo, useState } from "react";
import { HiChevronDown, HiOutlineCalendarDays } from "react-icons/hi2";

interface CreateTaskDueDatePickerProps {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
}

const dueDateFormatter = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
});

function parseDateValue(value: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const year = Number(value.slice(0, 4));
	const month = Number(value.slice(5, 7));
	const day = Number(value.slice(8, 10));
	const date = new Date(year, month - 1, day);
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return null;
	}
	return date;
}

function formatDateValue(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function CreateTaskDueDatePicker({
	value,
	onChange,
	disabled = false,
}: CreateTaskDueDatePickerProps) {
	const [open, setOpen] = useState(false);
	const selectedDate = useMemo(() => parseDateValue(value), [value]);
	const label = selectedDate
		? dueDateFormatter.format(selectedDate)
		: "Due date";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					className="flex h-9 items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-3 text-sm transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<HiOutlineCalendarDays className="size-4 text-muted-foreground" />
					<span className={selectedDate ? "" : "text-muted-foreground"}>
						{label}
					</span>
					<HiChevronDown className="size-3.5 text-muted-foreground" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-auto p-0" side="top">
				<Calendar
					mode="single"
					selected={selectedDate ?? undefined}
					onSelect={(date) => {
						if (!date) return;
						onChange(formatDateValue(date));
						setOpen(false);
					}}
				/>
				<div className="flex items-center justify-between border-t px-3 py-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => {
							onChange("");
							setOpen(false);
						}}
					>
						Clear
					</Button>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						onClick={() => {
							onChange(formatDateValue(new Date()));
							setOpen(false);
						}}
					>
						Today
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

import { Trans } from "@lingui/react/macro";
import { Calendar } from "@superset/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { type ReactNode, useState } from "react";

interface ProjectDatePickerProps {
	value: string | null;
	onChange: (value: string | null) => void;
	children: ReactNode;
}

export const toDate = (value: string) => new Date(`${value}T00:00:00`);

const toValue = (date: Date) =>
	[
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");

export function ProjectDatePicker({
	value,
	onChange,
	children,
}: ProjectDatePickerProps) {
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent align="start" className="w-auto p-0">
				<Calendar
					mode="single"
					selected={value ? toDate(value) : undefined}
					defaultMonth={value ? toDate(value) : undefined}
					onSelect={(date) => {
						onChange(date ? toValue(date) : null);
						setOpen(false);
					}}
				/>
				{value && (
					<button
						type="button"
						onClick={() => {
							onChange(null);
							setOpen(false);
						}}
						className="w-full border-t px-3 py-2 text-left text-xs text-muted-foreground hover:bg-fill-hover hover:text-foreground"
					>
						<Trans>Clear date</Trans>
					</button>
				)}
			</PopoverContent>
		</Popover>
	);
}

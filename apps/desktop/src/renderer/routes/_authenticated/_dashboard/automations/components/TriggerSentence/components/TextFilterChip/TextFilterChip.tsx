import type { TextFilter } from "@superset/shared/automation-triggers";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { ChipButton } from "../ChipButton";

/**
 * A free-text filter over a message body.
 *
 * The field lives in a popover rather than inline in the row: an input wide
 * enough to type in is several chips wide, and it breaks the line the sentence
 * is trying to read as. The chip shows the pattern once there is one.
 *
 * No regex toggle — `isRegex` is pinned false in the schema, since the pattern
 * is evaluated on the webhook path and a backtracking pattern never returns.
 */
export function TextFilterChip({
	value,
	onChange,
	emptyLabel,
	placeholder,
	disabled,
}: {
	value: TextFilter | null;
	onChange: (next: TextFilter | null) => void;
	emptyLabel: string;
	placeholder: string;
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
			<PopoverTrigger asChild>
				<span>
					<ChipButton
						label={value?.pattern || emptyLabel}
						empty={!value?.pattern}
						disabled={disabled}
						className="max-w-52"
					/>
				</span>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-2">
				<Input
					autoFocus
					value={value?.pattern ?? ""}
					placeholder={placeholder}
					disabled={disabled}
					onChange={(event) =>
						onChange(
							event.target.value
								? { pattern: event.target.value, isRegex: false }
								: null,
						)
					}
					onKeyDown={(event) => {
						if (event.key === "Enter") setOpen(false);
					}}
					className="h-8 text-[13px]"
				/>
			</PopoverContent>
		</Popover>
	);
}

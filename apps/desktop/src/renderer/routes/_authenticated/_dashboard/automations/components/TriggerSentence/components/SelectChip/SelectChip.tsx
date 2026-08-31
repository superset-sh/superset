import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuCheck } from "react-icons/lu";
import { ChipButton } from "../ChipButton";

/**
 * One choice from a short, known list.
 *
 * A dropdown rather than a Select: Select's trigger carries its own height,
 * padding and font size that a chip has to fight, and the sentence already
 * speaks in dropdowns everywhere else. The selected value is marked with a
 * trailing check, the way SelectItem does it — the RadioItem dot indents
 * every row for a gutter only one of them uses.
 */
export function SelectChip({
	value,
	onChange,
	options,
	disabled,
	className,
}: {
	value: string;
	onChange: (value: string) => void;
	options: readonly { value: string; label: string }[];
	disabled?: boolean;
	className?: string;
}) {
	const current = options.find((o) => o.value === value);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<span>
					<ChipButton
						label={current?.label ?? value}
						disabled={disabled}
						className={className}
					/>
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
				{options.map((option) => (
					<DropdownMenuItem
						key={option.value}
						className="relative pr-8"
						onSelect={() => onChange(option.value)}
					>
						{option.label}
						{option.value === value && (
							<span className="absolute right-2 flex size-3.5 items-center justify-center">
								<LuCheck className="size-4" />
							</span>
						)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

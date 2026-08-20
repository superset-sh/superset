import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { ChipButton } from "../ChipButton";

/**
 * One choice from a short, known list.
 *
 * A dropdown rather than a Select: Select's trigger carries its own height,
 * padding and font size that a chip has to fight, and the sentence already
 * speaks in dropdowns everywhere else.
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
				<DropdownMenuRadioGroup value={value} onValueChange={onChange}>
					{options.map((option) => (
						<DropdownMenuRadioItem key={option.value} value={option.value}>
							{option.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useState } from "react";
import { HiCheck, HiChevronDown } from "react-icons/hi2";

export interface MultiSelectFilterOption {
	value: string;
	label: string;
	icon?: ReactNode;
}

interface MultiSelectFilterProps {
	/** Trigger label when nothing is selected, e.g. "PR state". */
	placeholder: string;
	icon?: ReactNode;
	options: MultiSelectFilterOption[];
	value: string[];
	onChange: (value: string[]) => void;
	/** Show the search input (useful for long project lists). */
	searchable?: boolean;
}

export function MultiSelectFilter({
	placeholder,
	icon,
	options,
	value,
	onChange,
	searchable = false,
}: MultiSelectFilterProps) {
	const [open, setOpen] = useState(false);

	const selected = options.filter((option) => value.includes(option.value));
	const triggerLabel =
		selected.length === 0
			? placeholder
			: selected.length === 1
				? selected[0]?.label
				: `${selected[0]?.label} +${selected.length - 1}`;

	const toggle = (optionValue: string) => {
		onChange(
			value.includes(optionValue)
				? value.filter((entry) => entry !== optionValue)
				: [...value, optionValue],
		);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className={cn(
						"h-8 gap-1.5 font-normal",
						selected.length === 0 && "text-muted-foreground",
					)}
				>
					{icon}
					<span className="max-w-[10rem] truncate">{triggerLabel}</span>
					<HiChevronDown className="size-3 opacity-60" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-56 p-0">
				<Command>
					{searchable ? (
						<CommandInput
							placeholder={`Filter ${placeholder.toLowerCase()}…`}
						/>
					) : null}
					<CommandList>
						<CommandEmpty>No matches.</CommandEmpty>
						<CommandGroup>
							{options.map((option) => {
								const isSelected = value.includes(option.value);
								return (
									<CommandItem
										key={option.value}
										// Unique id as the cmdk value — duplicate labels (fork +
										// upstream of the same repo) must not collide; the label
										// stays searchable via keywords.
										value={option.value}
										keywords={[option.label]}
										onSelect={() => toggle(option.value)}
									>
										<span className="flex w-full min-w-0 items-center gap-2">
											{option.icon}
											<span className="min-w-0 flex-1 truncate">
												{option.label}
											</span>
											{isSelected ? <HiCheck className="size-3.5" /> : null}
										</span>
									</CommandItem>
								);
							})}
						</CommandGroup>
						{value.length > 0 ? (
							<CommandGroup>
								<CommandItem
									value="__clear__"
									onSelect={() => {
										onChange([]);
										setOpen(false);
									}}
									className="justify-center text-xs text-muted-foreground"
								>
									Clear
								</CommandItem>
							</CommandGroup>
						) : null}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

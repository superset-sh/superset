import { Button } from "@superset/ui/button";
import {
	Command,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { HiCheck, HiChevronDown } from "react-icons/hi2";
import { ActiveIcon } from "../../../shared/icons/ActiveIcon";
import { AllIssuesIcon } from "../../../shared/icons/AllIssuesIcon";
import { BacklogIcon } from "../../../shared/icons/BacklogIcon";

type TabValue = "all" | "active" | "backlog";

interface StatusFilterProps {
	value: TabValue;
	onChange: (value: TabValue) => void;
}

const OPTIONS: ReadonlyArray<{
	value: TabValue;
	label: string;
	Icon: typeof AllIssuesIcon;
}> = [
	{ value: "all", label: "All issues", Icon: AllIssuesIcon },
	{ value: "active", label: "Active", Icon: ActiveIcon },
	{ value: "backlog", label: "Backlog", Icon: BacklogIcon },
];

export function StatusFilter({ value, onChange }: StatusFilterProps) {
	const [open, setOpen] = useState(false);
	const selected = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];
	const SelectedIcon = selected.Icon;

	const handleSelect = (next: TabValue) => {
		onChange(next);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					title={selected.label}
					aria-label={selected.label}
					className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
				>
					<SelectedIcon className="size-3.5" />
					<span className="text-sm hidden @4xl:inline">{selected.label}</span>
					<HiChevronDown className="size-3" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-44 p-0">
				<Command>
					<CommandList>
						<CommandGroup>
							{OPTIONS.map((option) => {
								const Icon = option.Icon;
								return (
									<CommandItem
										key={option.value}
										onSelect={() => handleSelect(option.value)}
									>
										<Icon className="size-3.5 shrink-0" />
										<span className="text-sm">{option.label}</span>
										{option.value === value && (
											<HiCheck className="ml-auto size-3.5" />
										)}
									</CommandItem>
								);
							})}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

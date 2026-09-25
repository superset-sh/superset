import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Command,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import type { IconType } from "react-icons";
import { HiCheck, HiChevronDown } from "react-icons/hi2";
import {
	LuCircle,
	LuCircleCheck,
	LuCircleDot,
	LuCircleX,
} from "react-icons/lu";
import { ActiveIcon } from "../../../shared/icons/ActiveIcon";
import { AllIssuesIcon } from "../../../shared/icons/AllIssuesIcon";
import { BacklogIcon } from "../../../shared/icons/BacklogIcon";

import type { TabValue } from "../../TasksTopBar";

interface StatusFilterProps {
	value: TabValue;
	onChange: (value: TabValue) => void;
}

const OPTIONS: ReadonlyArray<{
	value: TabValue;
	Icon: IconType;
}> = [
	{ value: "all", Icon: AllIssuesIcon },
	{ value: "active", Icon: ActiveIcon },
	{ value: "backlog", Icon: BacklogIcon },
	{ value: "unstarted", Icon: LuCircle },
	{ value: "started", Icon: LuCircleDot },
	{ value: "completed", Icon: LuCircleCheck },
	{ value: "canceled", Icon: LuCircleX },
];

export function StatusFilter({ value, onChange }: StatusFilterProps) {
	const { t } = useLingui();
	const optionLabels: Record<TabValue, string> = {
		all: t({ message: "All tasks" }),
		active: t({ message: "Active" }),
		backlog: t({
			message: "Backlog",
		}),
		unstarted: t({
			message: "Todo",
		}),
		started: t({
			message: "In progress",
		}),
		completed: t({
			message: "Done",
		}),
		canceled: t({
			message: "Canceled",
		}),
	};
	const [open, setOpen] = useState(false);
	const selected = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];
	const SelectedIcon = selected.Icon;
	const selectedLabel = optionLabels[selected.value];

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
					title={selectedLabel}
					aria-label={selectedLabel}
					className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
				>
					<SelectedIcon className="size-3.5" />
					<span className="text-sm hidden @4xl:inline">{selectedLabel}</span>
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
										<span className="text-sm">
											{optionLabels[option.value]}
										</span>
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

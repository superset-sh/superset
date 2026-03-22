"use client";

import { BrainIcon, CheckIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "../ui/tooltip";

export type ThinkingLevel = "off" | "low" | "medium" | "high" | "xhigh";

interface ThinkingLevelOption {
	value: ThinkingLevel;
	label: string;
	description: string;
}

const DEFAULT_OPTION: ThinkingLevelOption = {
	value: "off",
	label: "Off",
	description: "No extended thinking",
};

const THINKING_LEVELS: ThinkingLevelOption[] = [
	DEFAULT_OPTION,
	{ value: "low", label: "Low", description: "Minimal reasoning effort" },
	{
		value: "medium",
		label: "Medium",
		description: "Moderate reasoning effort",
	},
	{ value: "high", label: "High", description: "Thorough reasoning effort" },
	{
		value: "xhigh",
		label: "Max",
		description: "Maximum reasoning effort",
	},
];

export type ThinkingToggleProps = Omit<
	ComponentProps<typeof Button>,
	"onClick" | "onToggle"
> & {
	level: ThinkingLevel;
	onLevelChange: (level: ThinkingLevel) => void;
};

export const ThinkingToggle = ({
	level,
	onLevelChange,
	className,
	...props
}: ThinkingToggleProps) => {
	const isActive = level !== "off";
	const activeOption =
		THINKING_LEVELS.find((o) => o.value === level) ?? DEFAULT_OPTION;

	return (
		<DropdownMenu>
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								className={cn(
									"px-2 gap-1 text-xs",
									isActive && "bg-accent text-accent-foreground",
									className,
								)}
								{...props}
							>
								<BrainIcon className="size-3.5" />
								<span>{activeOption.label}</span>
								<ChevronDownIcon className="size-2.5 opacity-50" />
								<span className="sr-only">
									Extended thinking: {activeOption.label}
								</span>
							</Button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent>
						<p>Extended thinking: {activeOption.label}</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
			<DropdownMenuContent align="start" className="w-56">
				{THINKING_LEVELS.map((option) => {
					const isSelected = option.value === level;
					return (
						<DropdownMenuItem
							key={option.value}
							onSelect={() => onLevelChange(option.value)}
							className="flex items-center gap-2"
						>
							<div className="flex flex-1 flex-col gap-0.5">
								<span className="text-sm font-medium">{option.label}</span>
								<span className="text-xs text-muted-foreground">
									{option.description}
								</span>
							</div>
							{isSelected && <CheckIcon className="size-4 shrink-0" />}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

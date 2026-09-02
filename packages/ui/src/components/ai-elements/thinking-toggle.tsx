"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { BrainIcon, CheckIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { i18n } from "../../lib/i18n";
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
	label: MessageDescriptor;
	description: MessageDescriptor;
}

const DEFAULT_OPTION: ThinkingLevelOption = {
	value: "off",
	label: msg({ id: "ui.thinkingToggle.off.label", message: "Off" }),
	description: msg({
		id: "ui.thinkingToggle.off.description",
		message: "No extended thinking",
	}),
};

const THINKING_LEVELS: ThinkingLevelOption[] = [
	DEFAULT_OPTION,
	{
		value: "low",
		label: msg({ id: "ui.thinkingToggle.low.label", message: "Low" }),
		description: msg({
			id: "ui.thinkingToggle.low.description",
			message: "Minimal reasoning effort",
		}),
	},
	{
		value: "medium",
		label: msg({ id: "ui.thinkingToggle.medium.label", message: "Medium" }),
		description: msg({
			id: "ui.thinkingToggle.medium.description",
			message: "Moderate reasoning effort",
		}),
	},
	{
		value: "high",
		label: msg({ id: "ui.thinkingToggle.high.label", message: "High" }),
		description: msg({
			id: "ui.thinkingToggle.high.description",
			message: "Thorough reasoning effort",
		}),
	},
	{
		value: "xhigh",
		label: msg({ id: "ui.thinkingToggle.xhigh.label", message: "Max" }),
		description: msg({
			id: "ui.thinkingToggle.xhigh.description",
			message: "Maximum reasoning effort",
		}),
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
	const activeLabel = i18n._(activeOption.label);

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
								<span>{activeLabel}</span>
								<ChevronDownIcon className="size-2.5 opacity-50" />
								<span className="sr-only">
									<Trans id="ui.thinkingToggle.srLabel">
										Extended thinking: {activeLabel}
									</Trans>
								</span>
							</Button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent>
						<p>
							<Trans id="ui.thinkingToggle.srLabel">
								Extended thinking: {activeLabel}
							</Trans>
						</p>
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
								<span className="text-sm font-medium">
									{i18n._(option.label)}
								</span>
								<span className="text-xs text-muted-foreground">
									{i18n._(option.description)}
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

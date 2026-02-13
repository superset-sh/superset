"use client";

import { BrainIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "../ui/tooltip";

export type ThinkingToggleProps = Omit<
	ComponentProps<typeof Button>,
	"onClick" | "onToggle"
> & {
	enabled: boolean;
	onToggle: (enabled: boolean) => void;
};

export const ThinkingToggle = ({
	enabled,
	onToggle,
	className,
	...props
}: ThinkingToggleProps) => (
	<TooltipProvider>
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className={cn(
						enabled && "bg-accent text-accent-foreground",
						className,
					)}
					onClick={() => onToggle(!enabled)}
					{...props}
				>
					<BrainIcon className="size-4" />
					<span className="sr-only">
						{enabled ? "Extended thinking enabled" : "Enable extended thinking"}
					</span>
				</Button>
			</TooltipTrigger>
			<TooltipContent>
				<p>
					{enabled ? "Extended thinking enabled" : "Enable extended thinking"}
				</p>
			</TooltipContent>
		</Tooltip>
	</TooltipProvider>
);

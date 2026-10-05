"use client";

import { useLingui } from "@lingui/react/macro";
import { SquareMousePointer } from "lucide-react";
import { cn } from "../../../../../../lib/utils";
import { Toggle } from "../../../../../ui/toggle";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "../../../../../ui/tooltip";

interface CommentModeButtonProps {
	enabled: boolean;
	openCount: number;
	onToggle: () => void;
	compact?: boolean;
}

export function CommentModeButton({
	enabled,
	openCount,
	onToggle,
	compact = false,
}: CommentModeButtonProps) {
	const { t } = useLingui();
	const label = enabled
		? t({ message: "Leave comment mode" })
		: t({ message: "Comment on this page" });

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Toggle
					size="sm"
					pressed={enabled}
					onPressedChange={onToggle}
					aria-label={label}
					className={
						compact
							? "h-6 min-w-6 gap-1 px-1 text-muted-foreground/60 hover:text-muted-foreground data-[state=on]:text-foreground"
							: "h-7 min-w-7 gap-1.5 px-2"
					}
				>
					<SquareMousePointer className="size-3.5" />
					{openCount > 0 ? (
						<span
							className={cn(
								"font-medium tabular-nums",
								compact ? "text-[11px]" : "text-xs",
							)}
						>
							{openCount}
						</span>
					) : null}
				</Toggle>
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}

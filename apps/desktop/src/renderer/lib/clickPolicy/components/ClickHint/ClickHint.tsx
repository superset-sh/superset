import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";

interface ClickHintProps {
	hint: string;
	side?: "top" | "right" | "bottom" | "left";
	children: ReactNode;
}

/**
 * Wraps a row in a shadcn Tooltip that surfaces the click hint on hover.
 * For rows in the regular DOM. For rows inside a shadow root (Pierre tree)
 * use ShadowClickHint instead.
 */
export function ClickHint({ hint, side = "bottom", children }: ClickHintProps) {
	if (!hint) return <>{children}</>;
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent side={side} showArrow={false}>
				{hint}
			</TooltipContent>
		</Tooltip>
	);
}

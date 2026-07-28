import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ComponentProps, ReactNode } from "react";
import { useHotkeyDisplay } from "../../hooks/useHotkeyDisplay";
import type { HotkeyId } from "../../registry";

/**
 * Wraps a trigger with a shortcut-only tooltip: after a long hover it shows
 * the hotkey as a single kbd-style chip. Renders children bare when no
 * hotkey is assigned.
 */
export function HotkeyTooltip({
	id,
	side = "bottom",
	children,
}: {
	id?: HotkeyId;
	side?: ComponentProps<typeof TooltipContent>["side"];
	children: ReactNode;
}) {
	const { text } = useHotkeyDisplay(id ?? ("" as HotkeyId));
	if (!id || text === "Unassigned") return <>{children}</>;
	return (
		<Tooltip delayDuration={1000}>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent side={side}>{text}</TooltipContent>
		</Tooltip>
	);
}

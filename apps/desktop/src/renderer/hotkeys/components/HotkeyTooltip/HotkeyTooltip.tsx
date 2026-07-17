import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ComponentProps, ReactNode } from "react";
import { useHotkeyDisplay } from "../../hooks/useHotkeyDisplay";
import type { HotkeyId } from "../../registry";

/**
 * Wraps a trigger with a shortcut-only tooltip: after a long hover it shows
 * just the hotkey's kbd chips. Renders children bare when no hotkey is
 * assigned.
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
	const { keys } = useHotkeyDisplay(id ?? ("" as HotkeyId));
	if (!id || keys[0] === "Unassigned") return <>{children}</>;
	return (
		<Tooltip delayDuration={700}>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent
				side={side}
				sideOffset={4}
				showArrow={false}
				className="px-1.5 py-1"
			>
				<KbdGroup>
					{keys.map((k) => (
						<Kbd key={k}>{k}</Kbd>
					))}
				</KbdGroup>
			</TooltipContent>
		</Tooltip>
	);
}

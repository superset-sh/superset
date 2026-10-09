import { cn } from "@superset/ui/utils";
import { useStatusColorOverride } from "renderer/stores/status-colors";
import type { ActivePaneStatus } from "shared/tabs-types";

// Re-export for consumers
export type { ActivePaneStatus } from "shared/tabs-types";

/** Lookup object for status indicator styling - avoids if/else chains */
const STATUS_CONFIG = {
	permission: {
		pingColor: "bg-yellow-400",
		dotColor: "bg-yellow-500",
		pulse: true,
		tooltip: "Needs input",
	},
	failed: {
		pingColor: "bg-red-400",
		dotColor: "bg-red-500",
		pulse: true,
		tooltip: "Agent failed",
	},
	working: {
		pingColor: "",
		dotColor: "bg-amber-500",
		pulse: false,
		tooltip: "Agent working",
	},
	review: {
		pingColor: "",
		dotColor: "bg-green-500",
		pulse: false,
		tooltip: "Ready for review",
	},
} as const satisfies Record<
	ActivePaneStatus,
	{ pingColor: string; dotColor: string; pulse: boolean; tooltip: string }
>;

interface StatusIndicatorProps {
	status: ActivePaneStatus;
	className?: string;
}

/**
 * Visual indicator for pane/workspace status.
 * - Yellow pulsing: needs user input (permission)
 * - Red pulsing: agent failed
 * - Amber static: agent working
 * - Green static: ready for review
 */
export function StatusIndicator({ status, className }: StatusIndicatorProps) {
	const config = STATUS_CONFIG[status];
	const colorOverride = useStatusColorOverride(status);
	const colorStyle = colorOverride
		? { backgroundColor: colorOverride }
		: undefined;

	return (
		<span className={cn("relative flex size-1.5 shrink-0", className)}>
			{config.pulse && (
				<span
					className={cn(
						"absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
						!colorOverride && config.pingColor,
					)}
					style={colorStyle}
				/>
			)}
			<span
				className={cn(
					"relative inline-flex size-full rounded-full",
					!colorOverride && config.dotColor,
				)}
				style={colorStyle}
			/>
		</span>
	);
}

/** Get tooltip text for a status - for consumers that wrap with Tooltip */
export function getStatusTooltip(status: ActivePaneStatus): string {
	return STATUS_CONFIG[status].tooltip;
}

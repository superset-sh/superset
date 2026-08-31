import { cn } from "@superset/ui/utils";
import type { ActivePaneStatus } from "shared/tabs-types";

// Re-export for consumers
export type { ActivePaneStatus } from "shared/tabs-types";

/** Lookup object for status indicator styling - avoids if/else chains */
const STATUS_CONFIG = {
	permission: {
		pingColor: "bg-warning",
		dotColor: "bg-warning",
		pulse: true,
		tooltip: "Needs input",
	},
	failed: {
		pingColor: "bg-destructive",
		dotColor: "bg-destructive",
		pulse: true,
		tooltip: "Agent failed",
	},
	working: {
		pingColor: "bg-warning",
		dotColor: "bg-warning",
		pulse: true,
		tooltip: "Agent working",
	},
	review: {
		pingColor: "",
		dotColor: "bg-success",
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
 * - Amber pulsing: agent working
 * - Green static: ready for review
 */
export function StatusIndicator({ status, className }: StatusIndicatorProps) {
	const config = STATUS_CONFIG[status];

	return (
		<span className={cn("relative flex size-2 shrink-0", className)}>
			{config.pulse && (
				<span
					className={cn(
						"absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
						config.pingColor,
					)}
				/>
			)}
			<span
				className={cn(
					"relative inline-flex size-2 rounded-full",
					config.dotColor,
				)}
			/>
		</span>
	);
}

/** Get tooltip text for a status - for consumers that wrap with Tooltip */
export function getStatusTooltip(status: ActivePaneStatus): string {
	return STATUS_CONFIG[status].tooltip;
}

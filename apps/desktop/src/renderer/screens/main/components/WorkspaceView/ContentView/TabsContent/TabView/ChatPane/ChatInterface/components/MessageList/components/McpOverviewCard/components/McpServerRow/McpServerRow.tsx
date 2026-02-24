import type { McpOverviewServerItem } from "../../McpOverviewCard.types";

interface McpServerRowProps {
	server: McpOverviewServerItem;
}

function getStateClassName(state: McpOverviewServerItem["state"]): string {
	switch (state) {
		case "enabled":
			return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
		case "disabled":
			return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
		default:
			return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
	}
}

function formatStateLabel(state: McpOverviewServerItem["state"]): string {
	switch (state) {
		case "enabled":
			return "Enabled";
		case "disabled":
			return "Disabled";
		default:
			return "Invalid";
	}
}

function formatTransportLabel(
	transport: McpOverviewServerItem["transport"],
): string {
	switch (transport) {
		case "remote":
			return "Remote";
		case "local":
			return "Local";
		default:
			return "Unknown";
	}
}

export function McpServerRow({ server }: McpServerRowProps) {
	return (
		<div className="flex items-start justify-between gap-3 px-4 py-3">
			<div className="min-w-0">
				<div className="truncate text-sm font-medium text-foreground">
					{server.name}
				</div>
				<div className="truncate text-xs text-muted-foreground">
					{server.target}
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-1.5">
				<span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
					{formatTransportLabel(server.transport)}
				</span>
				<span
					className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStateClassName(server.state)}`}
				>
					{formatStateLabel(server.state)}
				</span>
			</div>
		</div>
	);
}

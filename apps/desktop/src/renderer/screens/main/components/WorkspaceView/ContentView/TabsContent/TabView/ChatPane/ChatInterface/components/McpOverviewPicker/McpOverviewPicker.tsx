import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorEmpty,
	ModelSelectorGroup,
	ModelSelectorInput,
	ModelSelectorItem,
	ModelSelectorList,
} from "@superset/ui/ai-elements/model-selector";
import type { McpOverviewPayload, McpServerOverviewItem } from "../../types";

interface McpOverviewPickerProps {
	overview: McpOverviewPayload | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

function getStateClassName(state: McpServerOverviewItem["state"]): string {
	switch (state) {
		case "enabled":
			return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
		case "disabled":
			return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
		default:
			return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
	}
}

function formatStateLabel(state: McpServerOverviewItem["state"]): string {
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
	transport: McpServerOverviewItem["transport"],
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

export function McpOverviewPicker({
	overview,
	open,
	onOpenChange,
}: McpOverviewPickerProps) {
	const servers = overview?.servers ?? [];

	return (
		<ModelSelector open={open} onOpenChange={onOpenChange}>
			<ModelSelectorContent className="max-w-2xl" title="MCP Servers">
				<div className="border-b border-border/60 px-4 py-3">
					<div className="text-sm font-medium text-foreground">
						MCP Servers ({servers.length})
					</div>
					<div className="mt-1 truncate text-xs text-muted-foreground">
						{overview?.sourcePath
							? `Loaded from ${overview.sourcePath}`
							: "No MCP config found in this workspace"}
					</div>
				</div>
				<ModelSelectorInput placeholder="Search MCP servers..." />
				<ModelSelectorList className="max-h-[420px]">
					<ModelSelectorEmpty>No MCP servers configured.</ModelSelectorEmpty>
					<ModelSelectorGroup heading="Servers">
						{servers.map((server) => (
							<ModelSelectorItem
								key={server.name}
								value={`${server.name} ${server.target} ${server.transport} ${server.state}`}
							>
								<div className="min-w-0 flex-1">
									<div className="truncate text-sm font-medium text-foreground">
										{server.name}
									</div>
									<div className="truncate text-xs text-muted-foreground">
										{server.target}
									</div>
								</div>
								<div className="ml-3 flex shrink-0 items-center gap-1.5">
									<span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
										{formatTransportLabel(server.transport)}
									</span>
									<span
										className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStateClassName(server.state)}`}
									>
										{formatStateLabel(server.state)}
									</span>
								</div>
							</ModelSelectorItem>
						))}
					</ModelSelectorGroup>
				</ModelSelectorList>
			</ModelSelectorContent>
		</ModelSelector>
	);
}

import { McpServerRow } from "./components/McpServerRow";
import type { McpOverviewCardProps } from "./McpOverviewCard.types";

export function McpOverviewCard({ sourcePath, servers }: McpOverviewCardProps) {
	return (
		<div className="not-prose overflow-hidden rounded-lg border border-border/70 bg-card">
			<div className="border-b border-border/60 px-4 py-3">
				<div className="text-sm font-medium text-foreground">
					MCP Servers ({servers.length})
				</div>
				<div className="mt-1 text-xs text-muted-foreground">
					{sourcePath
						? `Loaded from ${sourcePath}`
						: "No .mcp.json found in this workspace"}
				</div>
			</div>

			{servers.length === 0 ? (
				<div className="px-4 py-3 text-sm text-muted-foreground">
					No MCP servers configured.
				</div>
			) : (
				<div className="divide-y divide-border/60">
					{servers.map((server) => (
						<McpServerRow key={server.name} server={server} />
					))}
				</div>
			)}
		</div>
	);
}

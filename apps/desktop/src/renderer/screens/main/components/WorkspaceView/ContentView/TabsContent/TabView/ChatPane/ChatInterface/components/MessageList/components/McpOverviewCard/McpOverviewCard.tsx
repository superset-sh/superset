import type { McpServerState, McpServerTransport } from "../../../../types";

interface McpOverviewCardProps {
	sourcePath: string | null;
	servers: Array<{
		name: string;
		state: McpServerState;
		transport: McpServerTransport;
		target: string;
	}>;
}

function getStateClassName(state: McpServerState): string {
	switch (state) {
		case "enabled":
			return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
		case "disabled":
			return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
		default:
			return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
	}
}

function formatStateLabel(state: McpServerState): string {
	switch (state) {
		case "enabled":
			return "Enabled";
		case "disabled":
			return "Disabled";
		default:
			return "Invalid";
	}
}

function formatTransportLabel(transport: McpServerTransport): string {
	switch (transport) {
		case "remote":
			return "Remote";
		case "local":
			return "Local";
		default:
			return "Unknown";
	}
}

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
						<div
							key={server.name}
							className="flex items-start justify-between gap-3 px-4 py-3"
						>
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
					))}
				</div>
			)}
		</div>
	);
}

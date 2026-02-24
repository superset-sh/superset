import { XIcon } from "lucide-react";
import { McpServerRow } from "./components/McpServerRow";
import type { McpOverviewCardProps } from "./McpOverviewCard.types";

export function McpOverviewCard({
	sourcePath,
	servers,
	onDismiss,
}: McpOverviewCardProps) {
	return (
		<div className="not-prose overflow-hidden rounded-lg border border-border/70 bg-card">
			<div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
				<div>
					<div className="text-sm font-medium text-foreground">
						MCP Servers ({servers.length})
					</div>
					<div className="mt-1 text-xs text-muted-foreground">
						{sourcePath
							? `Loaded from ${sourcePath}`
							: "No .mcp.json found in this workspace"}
					</div>
				</div>
				{onDismiss ? (
					<button
						type="button"
						onClick={onDismiss}
						className="rounded-md border border-border bg-background p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						aria-label="Dismiss MCP overview"
					>
						<XIcon className="size-3.5" />
					</button>
				) : null}
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

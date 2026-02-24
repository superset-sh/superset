import type { McpServerState, McpServerTransport } from "../../../../types";

export interface McpOverviewServerItem {
	name: string;
	state: McpServerState;
	transport: McpServerTransport;
	target: string;
}

export interface McpOverviewCardProps {
	sourcePath: string | null;
	servers: McpOverviewServerItem[];
}

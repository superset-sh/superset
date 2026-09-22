import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import {
	workspaceLocationInput,
	workspaceServiceCall,
} from "../../workspace-service-target";

interface TerminalSummary {
	terminalId: string;
	workspaceId: string;
	createdAt: number;
	exited: boolean;
	exitCode: number;
	attached: boolean;
	title: string | null;
}

export function register(server: McpServer): void {
	defineTool(server, {
		name: "terminals_list",
		annotations: { readOnlyHint: true },
		description:
			"List the live terminal sessions in a workspace (ids, titles, attach state). Use to discover a terminalId to terminals_send/terminals_read/terminals_close against when you didn't keep the one agents_create returned. Omit hostId for a cloud workspace; for a host workspace, use hosts_list / workspaces_list to find the hostId.",
		inputSchema: {
			...workspaceLocationInput,
			workspaceId: z
				.string()
				.uuid()
				.describe("Workspace UUID whose terminals to list."),
		},
		handler: async (input, ctx) => {
			return workspaceServiceCall<{ sessions: TerminalSummary[] }>(
				input,
				ctx,
				"terminal.list",
				"query",
				{ workspaceId: input.workspaceId },
			);
		},
	});
}

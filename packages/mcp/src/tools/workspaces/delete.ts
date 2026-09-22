import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";
import { requireCloudUnlessHost } from "../../workspace-service-target";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "workspaces_delete",
		annotations: { destructiveHint: true },
		description:
			"Delete a workspace by UUID. Without hostId it is a cloud workspace: its sandbox is torn down, which is what stops it billing (nothing else does, including leaving it idle), and everything inside is destroyed, so push or save work first; returns { deleted: false } when no such workspace exists. With hostId, the host runs the project's teardown script (.superset/config.json teardown commands or .superset/teardown.sh, if configured), then removes the git worktree; a teardown failure does not block the delete and is reported in `warnings`, and 'main'-type workspaces cannot be deleted.",
		inputSchema: {
			hostId: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Host machineId the workspace lives on. Omit for a cloud workspace (accounts with cloud workspaces only).",
				),
			id: z.string().uuid().describe("Workspace UUID."),
		},
		handler: async (input, ctx) => {
			if (!input.hostId) {
				await requireCloudUnlessHost(input, ctx);
				return createMcpCaller(ctx).cloudWorkspace.delete({ id: input.id });
			}
			return hostServiceCall<{
				success: boolean;
				cloudDeleted: boolean;
				worktreeRemoved: boolean;
				branchDeleted: boolean;
				warnings: string[];
			}>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"workspace.delete",
				"mutation",
				{ id: input.id },
			);
		},
	});
}

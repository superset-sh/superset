import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

const OPTION_GROUPS = [
	"github",
	"linear",
	"sentry",
	"microsoftTeams",
	"google",
	"notion",
	"slack",
] as const;

export function register(server: McpServer): void {
	defineTool(server, {
		name: "automations_trigger_options",
		annotations: { readOnlyHint: true },
		description:
			"List the values an event trigger can filter on for one connected provider — Slack channels, GitHub repositories, Linear teams and projects, Sentry projects, Notion data sources, Gmail labels and people. Call this before writing a {mode:'list', ids:[...]} scope in automations_create or automations_update: those ids are provider ids, and a name will not match. Each list comes back keyed by name, and a list is empty both when the organization has not connected that provider and when the lookup failed (a revoked token, or the provider being down) — so treat empty as unknown and ask the user to check the connection rather than reporting it as not connected.",
		inputSchema: {
			group: z
				.enum(OPTION_GROUPS)
				.describe(
					"Provider option group. 'google' returns Gmail labels and people; 'microsoftTeams' is Teams.",
				),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.integration.triggerOptions({
				organizationId: ctx.organizationId,
				group: input.group,
			});
		},
	});
}

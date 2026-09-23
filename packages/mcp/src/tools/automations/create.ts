import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { workspaceTagsInputSchema } from "@superset/shared/workspace-tags";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { triggersInput } from "./triggers";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "automations_create",
		annotations: { destructiveHint: false },
		description:
			"Create an automation that runs an agent on a schedule, on an external event, or both. Provide either `rrule` (a schedule) or `triggers` (the full trigger set, which may include event triggers). Pass v2ProjectId (run in a fresh workspace), v2WorkspaceId (reuse an existing workspace), or neither to run each time in a fresh project-less session workspace — call projects_list or workspaces_list first to get IDs. `agent` is the host-agent instance id (or presetId fallback) that runs the prompt.",
		inputSchema: {
			name: z
				.string()
				.min(1)
				.max(200)
				.describe("Human name for the automation."),
			prompt: z
				.string()
				.min(1)
				.max(100_000)
				.describe("Prompt the agent runs (markdown)."),
			agent: z
				.string()
				.min(1)
				.max(200)
				.describe(
					"Host agent instance id (UUID from /settings/agents) or presetId (e.g. 'claude', 'codex').",
				),
			targetHostId: z
				.string()
				.min(1)
				.nullish()
				.describe(
					"Host that should run the automation. Defaults to the owner's online host.",
				),
			v2ProjectId: z
				.string()
				.uuid()
				.nullish()
				.describe(
					"Project UUID. Omit both this and v2WorkspaceId for session mode (fresh project-less session workspace per run).",
				),
			v2WorkspaceId: z
				.string()
				.uuid()
				.nullish()
				.describe(
					"Workspace UUID to reuse. Pass targetHostId with it — required for session workspaces (no cloud record to resolve the host from).",
				),
			rrule: z
				.string()
				.min(1)
				.max(500)
				.optional()
				.describe(
					"RFC 5545 RRULE body, no DTSTART prefix. Example: FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0. Omit when passing `triggers`.",
				),
			dtstart: z
				.string()
				.datetime()
				.optional()
				.describe("First scheduled fire (ISO 8601). Defaults to now."),
			timezone: z
				.string()
				.min(1)
				.optional()
				.describe(
					"IANA timezone (e.g. America/New_York). Required with `rrule`.",
				),
			triggers: triggersInput,
			continueAgentSession: z
				.boolean()
				.optional()
				.describe(
					"Deliver each run's prompt into the agent session the previous run left behind instead of starting another beside it. Requires v2WorkspaceId — that is where the session lives. Use for an automation that should build up one conversation (triaging items one by one) rather than starting clean each time.",
				),
			tags: workspaceTagsInputSchema
				.optional()
				.describe(
					"Workspace tags applied to each run's created workspace; each tag files it into a sidebar folder of the same name. Defaults to ['automation'] so runs group out of the box.",
				),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.automation.create(input);
		},
	});
}

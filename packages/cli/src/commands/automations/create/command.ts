import { readFileSync } from "node:fs";
import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveWorkspacePin } from "../../../lib/host-workspaces";
import { formatAutomationDate } from "../format";

const DEFAULT_TIMEZONE =
	Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export default command({
	description: "Create a scheduled automation",
	options: {
		name: string().required().desc("Human-readable automation name"),
		prompt: string().desc("Prompt to send to the agent"),
		promptFile: string().desc("Path to a file containing the prompt"),
		rrule: string()
			.required()
			.desc(
				"RFC 5545 RRULE body, e.g. FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0",
			),
		timezone: string().desc(`IANA timezone (default: host TZ, else UTC)`),
		dtstart: string().desc("ISO 8601 start anchor (default: now)"),
		project: string().desc(
			"v2 project id — required for new-workspace-per-run mode",
		),
		workspace: string().desc("existing v2 workspace id — reuses it every run"),
		host: string().desc("Target host id (default: owner's online host)"),
		agent: string()
			.default("claude")
			.desc(
				"Host agent instance id or presetId (claude, codex, ...). Use 'superset' for the built-in chat agent.",
			),
	},
	run: async ({ ctx, options }) => {
		const prompt = options.prompt
			? options.prompt
			: options.promptFile
				? readFileSync(options.promptFile, "utf-8").trim()
				: null;
		if (!prompt) {
			throw new Error("Provide --prompt <text> or --prompt-file <path>");
		}

		if (!options.project && !options.workspace) {
			throw new Error("Provide --project or --workspace");
		}

		// Workspace records are host-owned: resolve --workspace across the
		// org's hosts so the mutation carries the denormalized pin
		// (targetHostId + v2ProjectId) alongside the workspace id.
		let pin: { targetHostId?: string; v2ProjectId?: string } = {};
		if (options.workspace) {
			const organizationId = ctx.config.organizationId;
			if (!organizationId) {
				throw new CLIError(
					"No active organization",
					"Run: superset auth login",
				);
			}
			pin = await resolveWorkspacePin(
				{ api: ctx.api, organizationId, userJwt: ctx.bearer },
				{
					workspaceId: options.workspace,
					hostId: options.host ?? undefined,
					projectId: options.project ?? undefined,
				},
			);
		}

		const result = await ctx.api.automation.create.mutate({
			name: options.name,
			prompt,
			agent: options.agent,
			targetHostId: pin.targetHostId ?? options.host ?? null,
			v2ProjectId: pin.v2ProjectId ?? options.project ?? undefined,
			v2WorkspaceId: options.workspace ?? undefined,
			rrule: options.rrule,
			dtstart: options.dtstart ? new Date(options.dtstart) : undefined,
			timezone: options.timezone ?? DEFAULT_TIMEZONE,
			mcpScope: [],
		});

		return {
			data: result,
			message: `Created automation "${result.name}" (${result.id})\nNext run: ${formatAutomationDate(result.nextRunAt, result.timezone)}`,
		};
	},
});

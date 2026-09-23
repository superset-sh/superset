import { readFileSync } from "node:fs";
import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostFilter } from "../../../lib/host-target";
import { formatAutomationDate } from "../format";
import { resolveAutomationTarget } from "../resolveAutomationTarget";
import { resolveTriggers } from "../resolveTriggers";

const DEFAULT_TIMEZONE =
	Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export default command({
	description: "Create a scheduled automation",
	options: {
		name: string().required().desc("Human-readable automation name"),
		prompt: string().desc("Prompt to send to the agent"),
		promptFile: string().desc("Path to a file containing the prompt"),
		rrule: string().desc(
			"RFC 5545 RRULE body, e.g. FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0. Omit when passing --triggers",
		),
		triggers: string().desc(
			"Trigger set as a JSON array, for event triggers (Slack, GitHub, Linear, ...). See --triggers-file",
		),
		triggersFile: string().desc(
			"Path to a JSON file holding the trigger set. Run `superset automations trigger-options --group slack` to resolve the ids a scope filters on",
		),
		timezone: string().desc(`IANA timezone (default: host TZ, else UTC)`),
		dtstart: string().desc("ISO 8601 start anchor (default: now)"),
		project: string().desc(
			"v2 project id for new-workspace-per-run mode. Omit (with no --workspace) to create a project-less session per run",
		),
		workspace: string().desc("existing v2 workspace id — reuses it every run"),
		continueSession: boolean().desc(
			"Deliver each run's prompt into the agent session the previous run left, instead of starting another. Requires --workspace",
		),
		host: string().desc(
			"Host the target project/workspace lives on (default: this machine)",
		),
		local: boolean().desc("Run the automation on this machine (the default)"),
		agent: string()
			.default("claude")
			.desc("Host agent instance id or presetId (claude, codex, ...)."),
		tag: string()
			.variadic()
			.desc(
				"Workspace tag applied to each run's created workspace. Repeatable. Each tag files the workspace into a sidebar folder of the same name",
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

		const triggers = resolveTriggers(options);
		if (!triggers && !options.rrule) {
			throw new CLIError(
				"An automation needs something to fire it",
				"Pass --rrule <RRULE> for a schedule, or --triggers-file <path> for event triggers",
			);
		}

		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const target = await resolveAutomationTarget({
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
			hostId: resolveHostFilter({
				host: options.host ?? undefined,
				local: options.local ?? undefined,
			}),
			workspaceId: options.workspace ?? undefined,
			projectId: options.project ?? undefined,
		});

		const result = await ctx.api.automation.create.mutate({
			name: options.name,
			prompt,
			agent: options.agent,
			targetHostId: target.targetHostId,
			v2ProjectId: target.v2ProjectId,
			v2WorkspaceId: options.workspace ?? undefined,
			continueAgentSession: options.continueSession ?? undefined,
			rrule: options.rrule ?? undefined,
			dtstart: options.dtstart ? new Date(options.dtstart) : undefined,
			timezone: options.timezone ?? DEFAULT_TIMEZONE,
			...(triggers ? { triggers } : {}),
			...(options.tag?.length ? { tags: options.tag } : {}),
		});

		const schedule = result.nextRunAt
			? `\nNext run: ${formatAutomationDate(result.nextRunAt, result.timezone)}`
			: "";
		return {
			data: result,
			message: `Created automation "${result.name}" (${result.id})${schedule}`,
		};
	},
});

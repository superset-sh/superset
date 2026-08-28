import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveAutomationTarget } from "../resolveAutomationTarget";

export default command({
	description: "Update an automation's metadata (name, schedule, agent, host)",
	args: [positional("id").required().desc("Automation id")],
	options: {
		name: string().desc("New name"),
		rrule: string().desc("New RRule body (RFC 5545)"),
		timezone: string().desc("New IANA timezone"),
		dtstart: string().desc("New ISO 8601 start anchor"),
		agent: string().desc(
			"New host agent instance id or presetId (e.g. claude, codex, superset).",
		),
		host: string().desc(
			"New target host id — moves the automation. Omitting it keeps the current host",
		),
		project: string().desc("New v2 project id"),
		workspace: string().desc(
			'New v2 workspace id to reuse every run. Pass "" to clear the pin so each run creates a fresh workspace',
		),
		session: boolean().desc(
			"Switch to session mode: no project, each run creates a project-less session workspace",
		),
		enabled: boolean().desc("Enable or pause the automation"),
	},
	run: async ({ ctx, args, options }) => {
		const id = args.id as string;

		// Validate before any mutation — setEnabled below must not run for a
		// rejected invocation.
		if (options.session && (options.workspace || options.project)) {
			throw new CLIError(
				"--session cannot be combined with --project or --workspace",
			);
		}

		if (options.enabled !== undefined) {
			await ctx.api.automation.setEnabled.mutate({
				id,
				enabled: options.enabled,
			});
		}

		// Retargeting (--workspace or --project) re-derives v2ProjectId
		// against a concrete host; the resource must exist there. That host
		// defaults to the automation's current one, not this machine, so an
		// update that omits --host never moves the automation (#6522).
		let target:
			| { targetHostId: string; v2ProjectId: string | null }
			| undefined;
		if (options.workspace || options.project) {
			const organizationId = ctx.config.organizationId;
			if (!organizationId) {
				throw new CLIError(
					"No active organization",
					"Run: superset auth login",
				);
			}
			const existing = await ctx.api.automation.get.query({ id });
			target = await resolveAutomationTarget({
				organizationId,
				userJwt: ctx.bearer,
				api: ctx.api,
				hostId: options.host ?? undefined,
				defaultHostId: existing.targetHostId ?? undefined,
				workspaceId: options.workspace || undefined,
				projectId: options.project ?? undefined,
			});
		}

		const result = await ctx.api.automation.update.mutate({
			id,
			name: options.name,
			rrule: options.rrule,
			timezone: options.timezone,
			dtstart: options.dtstart ? new Date(options.dtstart) : undefined,
			agent: options.agent,
			...(options.host !== undefined ? { targetHostId: options.host } : {}),
			...(options.project !== undefined
				? { v2ProjectId: options.project }
				: {}),
			// An empty --workspace is an explicit null: it clears the pin so
			// each run creates a fresh workspace again (#6523).
			...(options.workspace !== undefined
				? { v2WorkspaceId: options.workspace || null }
				: {}),
			// Session mode clears both the project and any workspace pin.
			...(options.session ? { v2ProjectId: null, v2WorkspaceId: null } : {}),
			...(target
				? {
						v2ProjectId: target.v2ProjectId,
						// A workspace pin is stored denormalized, so the pin's
						// host must ride along even without --host; it is the
						// automation's current host. A plain --project update
						// sends a host only when --host names one.
						...(options.workspace || options.host !== undefined
							? { targetHostId: target.targetHostId }
							: {}),
					}
				: {}),
		});

		return {
			data: result,
			message: `Updated automation "${result.name}"`,
		};
	},
});

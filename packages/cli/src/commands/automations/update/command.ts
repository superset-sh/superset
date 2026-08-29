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
		host: string().desc("New target host id"),
		project: string().desc("New v2 project id"),
		workspace: string().desc("New v2 workspace id"),
		session: boolean().desc(
			"Switch to session mode: no project, each run creates a project-less session workspace",
		),
		enabled: boolean().desc("Enable or pause the automation"),
		tag: string()
			.variadic()
			.desc(
				"Replace the tag set applied to each run's created workspace. Repeatable",
			),
		clearTags: boolean().desc("Remove every tag from the automation"),
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
		if (options.tag?.length && options.clearTags) {
			throw new CLIError(
				"Cannot combine --tag and --clear-tags",
				"Pass one or the other",
			);
		}

		if (options.enabled !== undefined) {
			await ctx.api.automation.setEnabled.mutate({
				id,
				enabled: options.enabled,
			});
		}

		// Retargeting (--workspace or --project) re-derives targetHostId +
		// v2ProjectId; the resource must exist on the target host.
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
			target = await resolveAutomationTarget({
				organizationId,
				userJwt: ctx.bearer,
				api: ctx.api,
				hostId: options.host ?? undefined,
				workspaceId: options.workspace ?? undefined,
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
			...(options.workspace !== undefined
				? { v2WorkspaceId: options.workspace }
				: {}),
			// Session mode clears both the project and any workspace pin.
			...(options.session ? { v2ProjectId: null, v2WorkspaceId: null } : {}),
			// --tag replaces the whole set; --clear-tags empties it.
			...(options.clearTags
				? { tags: [] }
				: options.tag?.length
					? { tags: options.tag }
					: {}),
			...target,
		});

		return {
			data: result,
			message: `Updated automation "${result.name}"`,
		};
	},
});

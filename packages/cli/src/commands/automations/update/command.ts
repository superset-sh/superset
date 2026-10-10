import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import { command } from "../../../lib/command";
import { resolveHostFilter } from "../../../lib/host-target";
import { resolveAutomationTarget } from "../resolveAutomationTarget";
import {
	refuseHostFlagsForCloud,
	resolveCloudAutomationTarget,
} from "../resolveCloudAutomationTarget";
import { resolveTriggers } from "../resolveTriggers";

export default command({
	description: "Update an automation (name, schedule, triggers, agent, host)",
	args: [positional("id").required().desc("Automation id")],
	options: {
		name: string().desc("New name"),
		rrule: string().desc("New RRule body (RFC 5545)"),
		triggers: string().desc(
			"Replace the whole trigger set with this JSON array. See --triggers-file",
		),
		triggersFile: string().desc(
			"Path to a JSON file holding the replacement trigger set. Fetch the current set with `superset automations get <id>` and resend the entries you want to keep, with their `id`, or they are deleted",
		),
		timezone: string().desc("New IANA timezone"),
		dtstart: string().desc("New ISO 8601 start anchor"),
		agent: string().desc(
			"New host agent instance id or presetId (e.g. claude, codex, superset).",
		),
		host: string().desc(
			"New target host id — moves the automation. Omitting it keeps the current host",
		),
		local: boolean().desc("Retarget the automation to this machine"),
		project: string().desc("New v2 project id"),
		workspace: string().desc(
			'New v2 workspace id to reuse every run; with --cloud, a cloud workspace id. Pass "" to clear the pin so each run creates a fresh workspace',
		),
		cloud: boolean().desc(
			"Run in the cloud: each run starts a cloud workspace from --environment, or reuses the one --workspace names",
		),
		environment: string().desc(
			"Id of the environment each run's cloud workspace starts from. Implies --cloud",
		),
		continueSession: boolean().desc(
			"Continue the agent session the previous run left (--continue-session) or start a new one each run (--no-continue-session). Requires a pinned workspace",
		),
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

		// Ahead of every mutation: `setEnabled` runs before the update, and a
		// combination the server will refuse must not flip `enabled` first.
		if (options.session && options.continueSession) {
			throw new CLIError(
				"--continue-session requires a pinned workspace",
				"Session mode has none; drop --session or pass --no-continue-session",
			);
		}
		if (options.rrule && (options.triggers || options.triggersFile)) {
			throw new CLIError(
				"Pass a schedule either as --rrule or inside the trigger set, not both",
				"The server refuses the combination; add a schedule trigger to the set instead.",
			);
		}

		const triggers = resolveTriggers(options);

		const targetHostId = resolveHostFilter({
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});

		// A cloud automation stays in the cloud unless a host is named. Only a
		// move into the cloud must name an environment or a workspace.
		const current =
			!targetHostId &&
			(options.workspace !== undefined ||
				options.project !== undefined ||
				options.session ||
				options.tag?.length ||
				options.clearTags ||
				(options.cloud && !options.environment))
				? await ctx.api.automation.get.query({ id })
				: null;
		const alreadyCloud = current?.targetHostId === CLOUD_HOST_ID;
		const cloud = Boolean(options.cloud || options.environment || alreadyCloud);
		if (cloud) {
			refuseHostFlagsForCloud({
				"--host": options.host,
				"--local": options.local,
				"--project": options.project,
				"--session": options.session,
				"--tag": options.tag?.length ? options.tag : undefined,
				"--clear-tags": options.clearTags,
			});
		}

		// Retargeting (--workspace or --project) re-derives v2ProjectId
		// against a concrete host; the resource must exist there. That host
		// defaults to the automation's current one, not this machine, so an
		// update that omits --host never moves the automation (#6522).
		let target:
			| { targetHostId: string; v2ProjectId: string | null }
			| undefined;
		let cloudTarget:
			| Awaited<ReturnType<typeof resolveCloudAutomationTarget>>["target"]
			| undefined;
		if (cloud) {
			const organizationId = ctx.config.organizationId;
			if (!organizationId) {
				throw new CLIError(
					"No active organization",
					"Run: superset auth login",
				);
			}
			cloudTarget = (
				await resolveCloudAutomationTarget({
					api: ctx.api,
					organizationId,
					environment: options.environment ?? undefined,
					workspaceId: options.workspace ?? undefined,
					requirePlacement: !alreadyCloud,
				})
			).target;
		} else if (options.workspace || options.project) {
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
				hostId: targetHostId,
				defaultHostId: current?.targetHostId ?? undefined,
				workspaceId: options.workspace || undefined,
				projectId: options.project ?? undefined,
			});
		}

		if (options.enabled !== undefined) {
			await ctx.api.automation.setEnabled.mutate({
				id,
				enabled: options.enabled,
			});
		}

		const result = await ctx.api.automation.update.mutate({
			id,
			name: options.name,
			rrule: options.rrule,
			timezone: options.timezone,
			dtstart: options.dtstart ? new Date(options.dtstart) : undefined,
			agent: options.agent,
			...(triggers ? { triggers } : {}),
			...(targetHostId !== undefined ? { targetHostId } : {}),
			...(options.project !== undefined
				? { v2ProjectId: options.project }
				: {}),
			// An empty --workspace is an explicit null: it clears the pin so
			// each run creates a fresh workspace again (#6523).
			...(options.workspace !== undefined && !cloud
				? { v2WorkspaceId: options.workspace || null }
				: {}),
			// Session mode clears both the project and any workspace pin.
			...(options.session ? { v2ProjectId: null, v2WorkspaceId: null } : {}),
			...(options.continueSession === undefined
				? {}
				: { continueAgentSession: options.continueSession }),
			// --tag replaces the whole set; --clear-tags empties it.
			...(options.clearTags
				? { tags: [] }
				: options.tag?.length
					? { tags: options.tag }
					: {}),
			...(target
				? {
						v2ProjectId: target.v2ProjectId,
						// A workspace pin is stored denormalized, so the pin's
						// host must ride along even without --host; it is the
						// automation's current host. A plain --project update
						// sends a host only when --host or --local names one.
						...(options.workspace || targetHostId !== undefined
							? { targetHostId: target.targetHostId }
							: {}),
					}
				: {}),
			...cloudTarget,
		});

		return {
			data: result,
			message: `Updated automation "${result.name}"`,
		};
	},
});

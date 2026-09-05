import { boolean, CLIError, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { findWorkspaceOnHost } from "../../../lib/host-workspaces";

export default command({
	description:
		"Resume every dead-but-resumable agent session in a workspace (a terminal that crashed, or died with the daemon or a reboot, without the agent's own clean exit)",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		dryRun: boolean().desc(
			"List what would be resumed without actually resuming anything",
		),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const hostId = options.host ?? getHostId();
		const { workspace } = await findWorkspaceOnHost(
			{ organizationId, userJwt: ctx.bearer, api: ctx.api, hostId },
			options.workspace,
		);
		if (!workspace) {
			throw new CLIError(
				`Workspace not found on host ${hostId}: ${options.workspace}`,
				"Pass --host <id> if it lives on another machine",
			);
		}

		const target = await resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});

		if (options.dryRun) {
			const candidates =
				await target.client.terminalAgents.resumeCandidates.query({
					workspaceId: options.workspace,
				});
			if (candidates.length === 0) {
				return {
					data: { candidates },
					message: "Nothing to resume — no dead-but-resumable sessions found.",
				};
			}
			const lines = candidates.map(
				(candidate) =>
					`${candidate.terminalId}  ${candidate.agentLabel}${
						candidate.resumeSupported
							? ""
							: " (resume not supported for this agent)"
					}`,
			);
			return {
				data: { candidates },
				message: [`Would resume ${candidates.length}:`, ...lines].join("\n"),
			};
		}

		const { results } = await target.client.terminalAgents.resumeAll.mutate({
			workspaceId: options.workspace,
		});

		if (results.length === 0) {
			return {
				data: { results },
				message: "Nothing to resume — no dead-but-resumable sessions found.",
			};
		}

		const resumed = results.filter((r) => r.resumed);
		const skipped = results.filter((r) => !r.resumed);
		const lines = [
			`Resumed ${resumed.length}/${results.length}.`,
			...resumed.map(
				(r) => `  ${r.terminalId} → ${r.newTerminalId} (${r.label})`,
			),
			...skipped.map((r) =>
				r.error
					? `  ${r.terminalId}: failed — ${r.error}`
					: `  ${r.terminalId}: skipped (already claimed, or resume unsupported)`,
			),
		];

		return { data: { results }, message: lines.join("\n") };
	},
});

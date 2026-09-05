import { CLIError, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { formatDistanceStrict } from "date-fns";
import { command } from "../../../lib/command";
import {
	type HostServiceClient,
	resolveHostTarget,
} from "../../../lib/host-target";
import { findWorkspaceOnHost } from "../../../lib/host-workspaces";

type TerminalAgentExplanation = Awaited<
	ReturnType<HostServiceClient["terminalAgents"]["explain"]["query"]>
>;

const END_REASON_GLOSS: Record<string, string> = {
	detached: "the agent reported its own end",
	"terminal-exited": "the terminal died under the agent; session is resumable",
	resumed: "the session was relaunched in a fresh terminal",
	disposed: "the session was deliberately killed",
};

export function formatExplanation(
	terminalId: string,
	result: TerminalAgentExplanation,
): string {
	if (!result.binding) {
		return [
			`No agent binding recorded for terminal ${terminalId}.`,
			"No agent hook has ever reported here — either only a plain shell ran in this terminal, or the agent's hook integration isn't wired up.",
		].join("\n");
	}

	const { binding, derivedStatus, sinceMs, msSincePtyOutput } = result;
	// sinceMs is host-clock relative, so anchor every "ago" to the host's now.
	const hostNow = binding.lastEventAt + sinceMs;
	const ago = (ts: number) =>
		`${formatDistanceStrict(new Date(ts), new Date(hostNow))} ago`;

	const lines = [
		`${binding.agentId} · ${derivedStatus} (last event ${binding.lastEventType}, ${ago(binding.lastEventAt)})`,
	];

	const session = binding.agentSessionId
		? `session ${binding.agentSessionId}`
		: "no agent session id captured";
	if (binding.endedAt !== null) {
		const gloss = binding.endReason ? END_REASON_GLOSS[binding.endReason] : "";
		lines.push(
			`${session}, started ${ago(binding.startedAt)}, ended ${ago(binding.endedAt)} (${binding.endReason}${gloss ? ` — ${gloss}` : ""})`,
		);
	} else {
		lines.push(`${session}, started ${ago(binding.startedAt)}, still live`);
	}

	if (derivedStatus === "idle" && binding.lastEventType === "Stop") {
		lines.push(
			'note: desktop may show "review" instead of "idle" until the pane has been viewed.',
		);
	} else if (derivedStatus === "working" || derivedStatus === "permission") {
		lines.push(
			"note: status is hook self-reporting with no liveness check — an agent interrupted with Esc/Ctrl+C fires no hook, so a stale last event can mean the status is stuck, not that the agent is busy.",
		);
		if (msSincePtyOutput !== null) {
			const silence = formatDistanceStrict(
				new Date(0),
				new Date(msSincePtyOutput),
			);
			lines.push(
				`evidence: terminal has produced no output for ${silence} — this can mean the agent is thinking silently, or that the status above is stale; it is not by itself proof of either.`,
			);
		}
	}

	return lines.join("\n");
}

export default command({
	description: "Explain a terminal's agent status from its hook-event evidence",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		terminal: string().required().desc("Terminal ID to explain"),
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

		const result = await target.client.terminalAgents.explain.query({
			workspaceId: options.workspace,
			terminalId: options.terminal,
		});

		return {
			data: result,
			message: formatExplanation(options.terminal, result),
		};
	},
});

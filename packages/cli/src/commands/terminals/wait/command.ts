import { CLIError, number, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { findWorkspaceOnHost } from "../../../lib/host-workspaces";
import { formatExplanation } from "../explain/command";

const AGENT_STATUSES = [
	"working",
	"permission",
	"failed",
	"idle",
	"ended",
] as const;
type AgentStatus = (typeof AGENT_STATUSES)[number];

const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 600_000;
const DEFAULT_TIMEOUT_MS = 120_000;

function isAgentStatus(value: string): value is AgentStatus {
	return (AGENT_STATUSES as readonly string[]).includes(value);
}

function parseUntil(raw: string): AgentStatus[] {
	const values = raw
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
	const invalid = values.filter((value) => !isAgentStatus(value));
	if (invalid.length > 0) {
		throw new CLIError(
			`--until: unknown status ${invalid.map((value) => `"${value}"`).join(", ")}`,
			`Valid statuses: ${AGENT_STATUSES.join(", ")}`,
		);
	}
	const until = [...new Set(values.filter(isAgentStatus))];
	if (until.length === 0) {
		throw new CLIError(
			"--until: at least one status is required",
			`Valid statuses: ${AGENT_STATUSES.join(", ")}`,
		);
	}
	return until;
}

function trpcErrorCode(error: unknown): string | undefined {
	if (!(error instanceof Error)) return undefined;
	const trpcError = error as Error & {
		code?: string;
		data?: { code?: string };
	};
	return trpcError.data?.code ?? trpcError.code;
}

export default command({
	description:
		"Block until a terminal's agent reaches one of the given statuses",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		terminal: string().required().desc("Terminal ID to wait on"),
		until: string()
			.default("idle,permission,failed,ended")
			.desc(
				"Comma-separated target statuses: working, permission, failed, idle, ended",
			),
		timeout: number()
			.int()
			.min(MIN_TIMEOUT_MS)
			.max(MAX_TIMEOUT_MS)
			.default(DEFAULT_TIMEOUT_MS)
			.desc(
				`Max time to wait, in milliseconds (default ${DEFAULT_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS})`,
			),
	},
	run: async ({ ctx, options }) => {
		const until = parseUntil(options.until);

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

		let result: Awaited<
			ReturnType<typeof target.client.terminalAgents.wait.mutate>
		>;
		try {
			result = await target.client.terminalAgents.wait.mutate({
				workspaceId: options.workspace,
				terminalId: options.terminal,
				until,
				timeoutMs: options.timeout,
			});
		} catch (error) {
			const code = trpcErrorCode(error);
			if (code === "TIMEOUT") {
				throw new CLIError(
					`Timed out after ${options.timeout}ms waiting for terminal ${options.terminal} to reach one of: ${until.join(", ")}`,
					"The agent may still be working — run 'superset terminals explain' to check, or increase --timeout",
				);
			}
			if (code === "NOT_FOUND") {
				throw new CLIError(
					`No agent binding recorded for terminal ${options.terminal}`,
					"No agent hook has ever reported here, so there is nothing to wait for. Run 'superset terminals explain' for details",
				);
			}
			throw error;
		}

		return {
			data: result,
			message: `Reached ${result.derivedStatus}.\n\n${formatExplanation(options.terminal, result)}`,
		};
	},
});

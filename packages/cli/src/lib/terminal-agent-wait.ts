import { CLIError } from "@superset/cli-framework";
import {
	isTerminalAgentWaitStatus,
	MAX_REMOTE_TERMINAL_AGENT_WAIT_TIMEOUT_MS,
	TERMINAL_AGENT_WAIT_STATUSES,
	type TerminalAgentWaitStatus,
} from "@superset/shared/terminal-agent-wait";
import { TRPCClientError } from "@trpc/client";
import type { HostServiceClient, ResolvedHostTarget } from "./host-target";

export type TerminalAgentStatusSnapshot = Awaited<
	ReturnType<HostServiceClient["terminalAgents"]["wait"]["mutate"]>
>;

export const MIN_TERMINAL_AGENT_WAIT_TIMEOUT_MS = 1_000;

const VALID_STATUSES = `Valid statuses: ${TERMINAL_AGENT_WAIT_STATUSES.join(", ")}`;

export function parseUntil(raw: string): TerminalAgentWaitStatus[] {
	const values = raw
		.split(",")
		.map((value) => value.trim().toLowerCase())
		.filter((value) => value.length > 0);
	const invalid = values.filter((value) => !isTerminalAgentWaitStatus(value));
	if (invalid.length > 0) {
		throw new CLIError(
			`--until: unknown status ${invalid.map((value) => `"${value}"`).join(", ")}`,
			VALID_STATUSES,
		);
	}
	const until = [...new Set(values.filter(isTerminalAgentWaitStatus))];
	if (until.length === 0) {
		throw new CLIError(
			"--until: at least one status is required",
			VALID_STATUSES,
		);
	}
	return until;
}

/**
 * A wait is one request held open. The relay cuts a remote request well
 * before the host's ceiling, so a remote wait that long would fail with a
 * transport error instead of a clean timeout.
 */
export function assertWaitTimeoutFitsTarget(
	kind: ResolvedHostTarget["kind"],
	timeoutMs: number,
): void {
	if (kind === "local") return;
	if (timeoutMs <= MAX_REMOTE_TERMINAL_AGENT_WAIT_TIMEOUT_MS) return;
	throw new CLIError(
		`--timeout ${timeoutMs} is too long for a workspace on another machine`,
		`The relay cuts a request open longer than about a minute. Pass --timeout ${MAX_REMOTE_TERMINAL_AGENT_WAIT_TIMEOUT_MS} or less and run the wait again when it times out.`,
	);
}

export function describeAgentStatus(
	snapshot: TerminalAgentStatusSnapshot,
): string {
	const seconds = (snapshot.sinceMs / 1000).toFixed(1);
	const event =
		snapshot.status === "ended"
			? (snapshot.binding.endReason ?? "ended")
			: snapshot.binding.lastEventType;
	return `${snapshot.status} (${event} ${seconds}s ago)`;
}

export function trpcErrorCode(error: unknown): string | undefined {
	return error instanceof TRPCClientError ? error.data?.code : undefined;
}

export function waitErrorToCliError(
	error: unknown,
	context: {
		terminalId: string;
		until: readonly TerminalAgentWaitStatus[];
		timeoutMs: number;
	},
): CLIError | undefined {
	const message = error instanceof Error ? error.message : "";
	switch (trpcErrorCode(error)) {
		case "TIMEOUT":
			return new CLIError(
				message ||
					`Timed out after ${context.timeoutMs}ms waiting for terminal ${context.terminalId} to reach one of: ${context.until.join(", ")}`,
				message.includes("no agent has reported")
					? "Only a terminal that 'agents create' launched reports a status. For a plain shell, use 'superset terminals wait-output'"
					: "The agent may still be working. Read the terminal, or run the wait again with the same --after so the status from before the prompt still does not count",
			);
		case "NOT_FOUND":
			if (isMissingProcedure(message)) {
				return new CLIError(
					"This host is too old to wait on an agent",
					"Update the host (superset update, or restart the desktop app), or poll with 'superset terminals read'",
				);
			}
			return new CLIError(
				message || `No terminal ${context.terminalId} in this workspace`,
				"Run 'superset terminals list' for the live terminal IDs",
			);
		default:
			return undefined;
	}
}

/** tRPC's own NOT_FOUND for a router without the procedure: `No "mutation"-procedure on path "…"`. */
export function isMissingProcedure(message: string): boolean {
	return message.includes("-procedure on path");
}

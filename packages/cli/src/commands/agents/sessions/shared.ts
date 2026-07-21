import { CLIError } from "@superset/cli-framework";
import type { CliContext } from "../../../lib/command";
import {
	type HostAgentSessionMatch,
	listHostAgentSessions,
} from "../../../lib/host-agent-sessions";
import { resolveHostFilter } from "../../../lib/host-target";

export const SESSION_STATUSES = [
	"working",
	"permission",
	"idle",
	"failed",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export function requireOrganizationId(ctx: CliContext): string {
	const organizationId = ctx.config.organizationId;
	if (!organizationId) {
		throw new CLIError("No active organization", "Run: superset auth login");
	}
	return organizationId;
}

export function printWarnings(warnings: string[]): void {
	for (const warning of warnings) process.stderr.write(`Warning: ${warning}\n`);
}

export function selectExactSession(
	matches: HostAgentSessionMatch[],
	terminalId: string,
): HostAgentSessionMatch {
	const exact = matches.filter(
		(candidate) => candidate.session.terminalId === terminalId,
	);
	if (exact.length === 0) {
		throw new CLIError(
			`Agent session not found: ${terminalId}`,
			"Run: superset agents sessions list",
		);
	}
	if (exact.length > 1) {
		throw new CLIError(
			`Agent session id matched multiple hosts: ${terminalId}`,
			"Pass --host <id> or --local to choose one host.",
		);
	}
	const match = exact[0];
	if (!match) throw new Error("unreachable: exact match disappeared");
	return match;
}

export async function resolveSession(
	ctx: CliContext,
	flags: { host?: string; local?: boolean },
	terminalId: string,
): Promise<HostAgentSessionMatch> {
	const organizationId = requireOrganizationId(ctx);
	const hostId = resolveHostFilter({
		host: flags.host,
		local: flags.local,
	});
	const { matches, warnings } = await listHostAgentSessions({
		api: ctx.api,
		organizationId,
		userJwt: ctx.bearer,
		...(hostId ? { hostId } : {}),
	});
	printWarnings(warnings);
	return selectExactSession(matches, terminalId);
}

export function parseDuration(value: string): number {
	const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(value.trim());
	if (!match) {
		throw new CLIError(
			`Invalid timeout: ${value}`,
			"Use a duration such as 30s, 5m, or 1h.",
		);
	}
	const amount = Number(match[1]);
	const unit = match[2] ?? "s";
	const multipliers: Record<string, number> = {
		ms: 1,
		s: 1000,
		m: 60_000,
		h: 3_600_000,
	};
	const multiplier = multipliers[unit] ?? 1000;
	const duration = amount * multiplier;
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new CLIError(`Invalid timeout: ${value}`);
	}
	return duration;
}

export function parseStatus(value: string): SessionStatus {
	if ((SESSION_STATUSES as readonly string[]).includes(value)) {
		return value as SessionStatus;
	}
	throw new CLIError(
		`Invalid session status: ${value}`,
		`Choose one of: ${SESSION_STATUSES.join(", ")}`,
	);
}

export async function waitForSession({
	match,
	statuses,
	timeoutMs,
	minEventAt,
	signal,
	pollIntervalMs = 500,
}: {
	match: HostAgentSessionMatch;
	statuses: ReadonlySet<SessionStatus>;
	timeoutMs: number;
	minEventAt?: number;
	signal: AbortSignal;
	pollIntervalMs?: number;
}): Promise<HostAgentSessionMatch["session"] | { status: "exited" }> {
	const deadline = Date.now() + timeoutMs;
	let lastStatus = match.session.status;
	while (Date.now() <= deadline) {
		if (signal.aborted) throw new CLIError("Interrupted while waiting");
		let session: HostAgentSessionMatch["session"];
		try {
			session = await match.client.terminalAgents.get.query(
				{ terminalId: match.session.terminalId },
				{ signal },
			);
		} catch (error) {
			if (isNotFoundError(error)) return { status: "exited" };
			throw error;
		}
		lastStatus = session.status;
		if (
			statuses.has(session.status) &&
			(minEventAt === undefined || session.lastEventAt >= minEventAt)
		) {
			return session;
		}
		await abortableDelay(pollIntervalMs, signal);
	}
	throw new CLIError(
		`Timed out waiting for agent session ${match.session.terminalId}`,
		`Last observed status: ${lastStatus}`,
	);
}

function isNotFoundError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const data = "data" in error ? error.data : undefined;
	if (
		typeof data === "object" &&
		data !== null &&
		"code" in data &&
		data.code === "NOT_FOUND"
	) {
		return true;
	}
	return (
		"message" in error &&
		typeof error.message === "string" &&
		error.message.includes("No live agent session")
	);
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(new CLIError("Interrupted while waiting"));
		};
		signal.addEventListener("abort", onAbort, { once: true });
	});
}

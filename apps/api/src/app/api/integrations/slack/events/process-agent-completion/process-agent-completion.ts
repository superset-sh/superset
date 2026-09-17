import { db } from "@superset/db/client";
import {
	integrationConnections,
	type SelectSlackAgentLaunch,
	type SelectSlackThreadSession,
	type SlackAgentLaunchOutcome,
	slackAgentLaunches,
	slackThreadSessions,
} from "@superset/db/schema";
import {
	HostServiceUnreachableError,
	hostServiceCall,
} from "@superset/mcp/host-service-client";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { posthog } from "@/lib/analytics";
import { scheduleCompletionCheck } from "../utils/agent-launches";
import {
	type AgentTurnEnd,
	buildCompletionMessage,
	type CompletionPullRequest,
	lastAssistantLine,
} from "../utils/completion-message";
import { type HostAccess, hostAccessFor } from "../utils/host-access";
import { createSlackClient } from "../utils/slack-client";

/** Past this the thread has moved on; a late "finished" would only confuse. */
export const LAUNCH_MAX_AGE_MS = 24 * 60 * 60_000;
const TRANSCRIPT_MAX_CHARS = 12_000;
/** A hung relay must not burn the job's 60s; a look that times out is retried. */
const RELAY_TIMEOUT_MS = 15_000;
/**
 * completed_at is a lease as well as a claim: a worker that took it and died
 * before posting (outcome still null) is retaken after this long.
 */
const CLAIM_LEASE_MS = 2 * 60_000;

function relay<T>(
	host: HostAccess,
	procedure: string,
	method: "query" | "mutation",
	input?: unknown,
): Promise<T> {
	return hostServiceCall<T>(host, procedure, method, input, {
		signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
	});
}

interface HostBinding {
	terminalId: string;
	lastEventType: string;
	endedAt?: number;
}

interface HostTerminal {
	terminalId: string;
	exited: boolean;
}

export type AgentTurnState =
	| { kind: "running" }
	| { kind: "ended"; end: AgentTurnEnd };

/**
 * The host's view of the launched terminal. A live agent binding says whether
 * the turn ended. Without one, only a terminal whose foreground process is
 * still running can be an agent that has not reported yet; anything else is
 * an agent that left without a Stop.
 */
export function agentTurnState(host: {
	binding?: HostBinding;
	terminal?: HostTerminal;
	processRunning?: boolean;
}): AgentTurnState {
	const { binding, terminal } = host;
	if (binding && binding.endedAt === undefined) {
		if (binding.lastEventType === "Stop") {
			return { kind: "ended", end: "stopped" };
		}
		if (binding.lastEventType === "Failed") {
			return { kind: "ended", end: "failed" };
		}
		// Parked on a permission prompt, the agent will not report on its
		// own; the thread is told once and someone answers it in Superset.
		if (binding.lastEventType === "PermissionRequest") {
			return { kind: "ended", end: "waiting" };
		}
		return { kind: "running" };
	}
	if (!terminal || terminal.exited || !host.processRunning) {
		return { kind: "ended", end: "exited" };
	}
	return { kind: "running" };
}

async function probeAgentTurn(
	host: HostAccess,
	launch: SelectSlackAgentLaunch,
): Promise<AgentTurnState> {
	const bindings = await relay<HostBinding[]>(
		host,
		"terminalAgents.listByWorkspace",
		"query",
		{ workspaceId: launch.workspaceId },
	);
	const binding = bindings.find(
		(candidate) => candidate.terminalId === launch.terminalId,
	);
	if (binding) return agentTurnState({ binding });

	const { sessions } = await relay<{ sessions: HostTerminal[] }>(
		host,
		"terminal.list",
		"query",
		{ workspaceId: launch.workspaceId },
	);
	const terminal = sessions.find(
		(candidate) => candidate.terminalId === launch.terminalId,
	);
	if (!terminal || terminal.exited) return agentTurnState({ terminal });

	const { running } = await relay<{ running: boolean }>(
		host,
		"terminal.hasRunningProcess",
		"query",
		{ terminalId: launch.terminalId, workspaceId: launch.workspaceId },
	);
	return agentTurnState({ terminal, processRunning: running });
}

async function linkedPullRequest(
	host: HostAccess,
	workspaceId: string,
): Promise<CompletionPullRequest | null> {
	// The host links a PR on its next branch sync; a PR the agent opened in its
	// last minute may not be linked yet, so ask for a sync first.
	try {
		await relay(host, "pullRequests.refreshByWorkspaces", "mutation", {
			workspaceIds: [workspaceId],
		});
	} catch (error) {
		console.warn("[slack/agent-completion] PR refresh failed", {
			workspaceId,
			error: String(error),
		});
	}
	try {
		const { workspaces } = await relay<{
			workspaces: {
				workspaceId: string;
				pullRequest: CompletionPullRequest | null;
			}[];
		}>(host, "pullRequests.getByWorkspaces", "query", {
			workspaceIds: [workspaceId],
		});
		return (
			workspaces.find((row) => row.workspaceId === workspaceId)?.pullRequest ??
			null
		);
	} catch (error) {
		console.warn("[slack/agent-completion] PR lookup failed", {
			workspaceId,
			error: String(error),
		});
		return null;
	}
}

async function agentSummary(
	host: HostAccess,
	launch: SelectSlackAgentLaunch,
): Promise<string | null> {
	try {
		const transcript = await relay<{
			text: string;
			source: "harness" | "stream" | "screen";
		}>(host, "terminal.transcript", "query", {
			terminalId: launch.terminalId,
			workspaceId: launch.workspaceId,
			maxChars: TRANSCRIPT_MAX_CHARS,
		});
		return transcript.source === "harness"
			? lastAssistantLine(transcript.text)
			: null;
	} catch (error) {
		console.warn("[slack/agent-completion] transcript read failed", {
			launchId: launch.id,
			error: String(error),
		});
		return null;
	}
}

function quietedAfterLaunch(
	session: SelectSlackThreadSession,
	launch: SelectSlackAgentLaunch,
): boolean {
	return (
		session.quiet &&
		session.quietedAt !== null &&
		session.quietedAt.getTime() > launch.launchedAt.getTime()
	);
}

async function finishLaunch(
	launchId: string,
	outcome: SlackAgentLaunchOutcome,
): Promise<void> {
	await db
		.update(slackAgentLaunches)
		.set({ completedAt: new Date(), outcome })
		.where(
			and(
				eq(slackAgentLaunches.id, launchId),
				isNull(slackAgentLaunches.outcome),
			),
		);
}

async function checkAgain(launch: SelectSlackAgentLaunch): Promise<void> {
	const polls = launch.polls + 1;
	await db
		.update(slackAgentLaunches)
		.set({ polls })
		.where(eq(slackAgentLaunches.id, launch.id));
	await scheduleCompletionCheck({ launchId: launch.id, polls });
}

/**
 * One look at a launched agent: reschedule while it is still on its first
 * turn, and once it has stopped, failed or exited, tell the thread exactly
 * once. The `completed_at` claim is what makes the post at-most-once.
 */
export async function processAgentCompletion({
	launchId,
}: {
	launchId: string;
}): Promise<void> {
	const launch = await db.query.slackAgentLaunches.findFirst({
		where: eq(slackAgentLaunches.id, launchId),
	});
	if (!launch || launch.outcome) return;
	if (launch.completedAt) {
		// Another worker holds the claim. It posts, or dies and the lease
		// expires; either way the next look settles it.
		if (Date.now() - launch.completedAt.getTime() < CLAIM_LEASE_MS) {
			await checkAgain(launch);
			return;
		}
	}
	if (Date.now() - launch.launchedAt.getTime() > LAUNCH_MAX_AGE_MS) {
		await finishLaunch(launch.id, "expired");
		return;
	}

	const session = await db.query.slackThreadSessions.findFirst({
		where: eq(slackThreadSessions.id, launch.threadSessionId),
	});
	const connection = session
		? await db.query.integrationConnections.findFirst({
				where: and(
					eq(integrationConnections.provider, "slack"),
					eq(integrationConnections.organizationId, session.organizationId),
					eq(integrationConnections.externalOrgId, session.teamId),
					isNull(integrationConnections.disconnectedAt),
				),
				orderBy: [
					desc(integrationConnections.updatedAt),
					desc(integrationConnections.id),
				],
				columns: { accessToken: true },
			})
		: undefined;
	if (!session || !connection) {
		await finishLaunch(launch.id, "orphaned");
		return;
	}

	const host = await hostAccessFor({
		userId: launch.launchedByUserId,
		organizationId: session.organizationId,
		hostId: launch.hostId,
		scope: "slack-agent-completion",
	});

	let state: AgentTurnState;
	try {
		state = await probeAgentTurn(host, launch);
	} catch (error) {
		if (!(error instanceof HostServiceUnreachableError)) {
			console.warn("[slack/agent-completion] host probe failed", {
				launchId,
				error: String(error),
			});
		}
		await checkAgain(launch);
		return;
	}
	if (state.kind === "running") {
		await checkAgain(launch);
		return;
	}

	if (quietedAfterLaunch(session, launch)) {
		await finishLaunch(launch.id, "quieted");
		return;
	}

	const claimed = await db
		.update(slackAgentLaunches)
		.set({ completedAt: new Date() })
		.where(
			and(
				eq(slackAgentLaunches.id, launch.id),
				isNull(slackAgentLaunches.outcome),
				or(
					isNull(slackAgentLaunches.completedAt),
					lt(
						slackAgentLaunches.completedAt,
						new Date(Date.now() - CLAIM_LEASE_MS),
					),
				),
			),
		)
		.returning({ id: slackAgentLaunches.id });
	if (claimed.length === 0) return;

	const [summary, pullRequest] = await Promise.all([
		agentSummary(host, launch),
		linkedPullRequest(host, launch.workspaceId),
	]);
	const message = buildCompletionMessage({
		agentLabel: launch.agentLabel,
		workspaceName: launch.workspaceName,
		workspaceBranch: launch.workspaceBranch,
		end: state.end,
		summary,
		pullRequest,
	});

	let outcome: SlackAgentLaunchOutcome =
		state.end === "waiting" ? "waiting" : "posted";
	try {
		await createSlackClient(connection.accessToken).chat.postMessage({
			channel: session.channelId,
			thread_ts: session.threadTs,
			text: message.text,
			blocks: [{ type: "markdown", text: message.markdown }],
		});
	} catch (error) {
		outcome = "post_failed";
		console.error("[slack/agent-completion] Failed to post completion", {
			launchId,
			error: String(error),
		});
	}
	await db
		.update(slackAgentLaunches)
		.set({ outcome })
		.where(eq(slackAgentLaunches.id, launch.id));

	posthog.capture({
		distinctId: launch.launchedByUserId,
		event: "slack_agent_completion_posted",
		properties: {
			outcome,
			end: state.end,
			has_pull_request: pullRequest !== null,
			has_summary: summary !== null,
			polls: launch.polls,
		},
	});
}

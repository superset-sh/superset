import {
	type AgentObservation,
	type AgentWaitTarget,
	agentReactedSince,
	agentWaitSatisfied,
	agentWaitState,
	pollUntil,
	withAgentExit,
} from "./agent-wait";
import type { HostServiceClient } from "./host-target";
import { INTERRUPT_KEYS } from "./terminal-keys";

const POLL_INTERVAL_MS = 500;
// A prompt that produces no hook event this long after the send was not
// picked up (left in the composer, agent not ready); waiting longer hides it.
const PROMPT_STALL_MS = 10_000;

interface TerminalRef {
	workspaceId: string;
	terminalId: string;
}

export async function waitForAgent({
	client,
	ref,
	until,
	timeoutMs,
	after,
}: {
	client: HostServiceClient;
	ref: TerminalRef;
	until: AgentWaitTarget;
	timeoutMs: number;
	after?: number;
}): Promise<{
	observation: AgentObservation;
	timedOut: boolean;
	stalled?: boolean;
}> {
	const start = Date.now();
	let sawAgent = after !== undefined;
	const read = async () => {
		const observation = await observeAgent(client, ref);
		const tracked = withAgentExit(sawAgent, observation);
		if (observation.binding) sawAgent = true;
		return tracked;
	};
	if (after !== undefined && timeoutMs > PROMPT_STALL_MS) {
		const reaction = await pollUntil({
			read,
			done: (observation) => agentReactedSince(observation, after),
			timeoutMs: PROMPT_STALL_MS,
			intervalMs: POLL_INTERVAL_MS,
		});
		if (reaction.timedOut) {
			return { observation: reaction.value, timedOut: false, stalled: true };
		}
	}
	const { value, timedOut } = await pollUntil({
		read,
		done: (observation) =>
			agentWaitSatisfied(observation, until, after) ||
			agentWaitState(observation) === "exited",
		timeoutMs: Math.max(0, timeoutMs - (Date.now() - start)),
		intervalMs: POLL_INTERVAL_MS,
	});
	return { observation: value, timedOut };
}

export async function observeAgent(
	client: HostServiceClient,
	{ workspaceId, terminalId }: TerminalRef,
): Promise<AgentObservation> {
	const bindings = await client.terminalAgents.listByWorkspace.query({
		workspaceId,
	});
	const binding = bindings.find((row) => row.terminalId === terminalId);
	if (binding) return { binding, terminalAlive: true };
	// Hosts before `terminalAgents.get` can't say; the wait then treats the
	// shell as an agent still starting.
	const ended = await client.terminalAgents.get
		.query({ workspaceId, terminalId })
		.then((row) => row?.endedAt != null)
		.catch(() => false);
	if (ended) return { binding: undefined, terminalAlive: false };
	const { sessions } = await client.terminal.list.query({ workspaceId });
	return {
		binding: undefined,
		terminalAlive: sessions.some(
			(session) => session.terminalId === terminalId && !session.exited,
		),
	};
}

/**
 * Agents fire no Stop hook when Esc or Ctrl+C interrupts a turn, so the
 * binding would stay "working". The desktop clears it the same way.
 */
export async function clearAgentStatusAfterInterrupt(
	client: HostServiceClient,
	ref: TerminalRef,
	sent: readonly string[],
): Promise<void> {
	if (!sent.some((bytes) => INTERRUPT_KEYS.has(bytes))) return;
	const state = agentWaitState(await observeAgent(client, ref));
	if (state !== "working" && state !== "blocked") return;
	await client.terminalAgents.clearWorkspaceStatuses.mutate(ref);
}

import {
	type AgentRunState,
	agentRunState,
} from "@superset/shared/agent-status";

export const AGENT_WAIT_TARGETS = [
	"settled",
	"idle",
	"blocked",
	"working",
] as const;
export type AgentWaitTarget = (typeof AGENT_WAIT_TARGETS)[number];
export type AgentWaitState = AgentRunState | "exited";

export interface AgentBindingSnapshot {
	lastEventType: string;
	lastEventAt: number;
}

/**
 * No binding on a live terminal, or only the launch event, means the agent
 * has not started its first turn yet.
 */
export interface AgentObservation {
	binding: AgentBindingSnapshot | undefined;
	terminalAlive: boolean;
}

export function agentWaitState({
	binding,
	terminalAlive,
}: AgentObservation): AgentWaitState {
	if (!binding) return terminalAlive ? "starting" : "exited";
	return agentRunState(binding.lastEventType);
}

export function agentStateMatches(
	state: AgentWaitState,
	until: AgentWaitTarget,
): boolean {
	switch (until) {
		case "settled":
			return state !== "working" && state !== "starting";
		case "idle":
			return state === "idle" || state === "exited";
		case "blocked":
			return state === "blocked";
		case "working":
			return state === "working";
	}
}

/**
 * With `after`, only an event newer than that host timestamp counts, so a
 * wait started right after a send does not match the previous turn's state.
 */
export function agentWaitSatisfied(
	observation: AgentObservation,
	until: AgentWaitTarget,
	after?: number,
): boolean {
	if (!agentStateMatches(agentWaitState(observation), until)) return false;
	const { binding } = observation;
	if (after === undefined || !binding) return true;
	return binding.lastEventAt > after;
}

/** The agent reacted after `after`: a newer hook event, or it exited. */
export function agentReactedSince(
	observation: AgentObservation,
	after: number,
): boolean {
	const { binding } = observation;
	return !binding ? !observation.terminalAlive : binding.lastEventAt > after;
}

export interface PollOptions<T> {
	read: () => Promise<T>;
	done: (value: T) => boolean;
	timeoutMs: number;
	intervalMs: number;
	sleep?: (ms: number) => Promise<unknown>;
	now?: () => number;
}

export async function pollUntil<T>({
	read,
	done,
	timeoutMs,
	intervalMs,
	sleep = Bun.sleep,
	now = Date.now,
}: PollOptions<T>): Promise<{ value: T; timedOut: boolean }> {
	const deadline = now() + timeoutMs;
	for (;;) {
		const value = await read();
		if (done(value)) return { value, timedOut: false };
		if (now() >= deadline) return { value, timedOut: true };
		await sleep(Math.min(intervalMs, Math.max(0, deadline - now())));
	}
}

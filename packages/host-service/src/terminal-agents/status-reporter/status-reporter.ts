import type {
	AgentCardState,
	AgentStatusReport,
	AgentStatusTransition,
} from "@superset/shared/agent-status";
import { agentCardStateFromEvent } from "@superset/shared/agent-status";
import type { TerminalAgentBinding } from "../types";

export interface WorkspaceDescription {
	name: string;
	projectId?: string;
	projectName?: string;
}

interface ReporterStore {
	on(event: "change", listener: (workspaceId: string) => void): unknown;
	off(event: "change", listener: (workspaceId: string) => void): unknown;
	list(): TerminalAgentBinding[];
}

export interface TerminalAgentStatusReporterOptions {
	store: ReporterStore;
	machineId: string;
	send: (report: AgentStatusReport) => Promise<void>;
	describeWorkspace: (workspaceId: string) => WorkspaceDescription | null;
	debounceMs?: number;
}

interface Observed {
	state: AgentCardState;
	workspaceId: string;
	sinceAt: number;
}

const DEFAULT_DEBOUNCE_MS = 2_000;

/**
 * Tells the cloud when a terminal's agent changes what it wants. The store
 * hears every hook event, hundreds an hour for a busy agent, but the card
 * only cares about the handful of moments the derived state changes, so
 * this diffs the whole store against what it last reported and sends one
 * batched call per quiet period.
 */
export class TerminalAgentStatusReporter {
	private readonly store: ReporterStore;
	private readonly machineId: string;
	private readonly send: (report: AgentStatusReport) => Promise<void>;
	private readonly describeWorkspace: (
		workspaceId: string,
	) => WorkspaceDescription | null;
	private readonly debounceMs: number;
	private readonly reported = new Map<string, AgentCardState>();
	private timer: ReturnType<typeof setTimeout> | null = null;
	private inFlight: Promise<void> | null = null;
	private dirty = false;
	private stopped = false;
	private readonly onChange = () => this.schedule();

	constructor(options: TerminalAgentStatusReporterOptions) {
		this.store = options.store;
		this.machineId = options.machineId;
		this.send = options.send;
		this.describeWorkspace = options.describeWorkspace;
		this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
		this.store.on("change", this.onChange);
	}

	private schedule(): void {
		if (this.stopped) return;
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.timer = null;
			void this.flush();
		}, this.debounceMs);
	}

	private observe(): Map<string, Observed> {
		const observed = new Map<string, Observed>();
		for (const binding of this.store.list()) {
			if (binding.endedAt !== undefined) continue;
			const state = agentCardStateFromEvent(binding.lastEventType);
			if (!state) continue;
			observed.set(binding.terminalId, {
				state,
				workspaceId: binding.workspaceId,
				sinceAt: binding.lastEventAt,
			});
		}
		return observed;
	}

	private diff(observed: Map<string, Observed>): AgentStatusTransition[] {
		const transitions: AgentStatusTransition[] = [];
		for (const [terminalId, current] of observed) {
			if (this.reported.get(terminalId) === current.state) continue;
			const workspace = this.describeWorkspace(current.workspaceId);
			if (!workspace) continue;
			transitions.push({
				terminalId,
				workspaceId: current.workspaceId,
				workspaceName: workspace.name,
				...(workspace.projectId ? { projectId: workspace.projectId } : {}),
				...(workspace.projectName
					? { projectName: workspace.projectName }
					: {}),
				state: current.state,
				sinceAt: current.sinceAt,
			});
		}
		for (const terminalId of this.reported.keys()) {
			if (observed.has(terminalId)) continue;
			transitions.push(gone(terminalId));
		}
		return transitions;
	}

	/**
	 * Send whatever differs from the last successful report. A failure keeps
	 * the difference pending; the next store change tries again.
	 */
	async flush(): Promise<void> {
		if (this.inFlight) {
			this.dirty = true;
			return this.inFlight;
		}
		const transitions = this.diff(this.observe());
		if (transitions.length === 0) return;
		this.inFlight = this.deliver(transitions).finally(() => {
			this.inFlight = null;
			if (this.dirty) {
				this.dirty = false;
				this.schedule();
			}
		});
		return this.inFlight;
	}

	private async deliver(transitions: AgentStatusTransition[]): Promise<void> {
		try {
			await this.send({ machineId: this.machineId, terminals: transitions });
		} catch (error) {
			console.warn(
				"[terminal-agents] status report failed:",
				error instanceof Error ? error.message : error,
			);
			return;
		}
		for (const transition of transitions) {
			if (transition.state === "gone")
				this.reported.delete(transition.terminalId);
			else this.reported.set(transition.terminalId, transition.state);
		}
	}

	/** Shutdown: every row this host put on the card comes off it. */
	async reportAllGone(): Promise<void> {
		this.stop();
		if (this.inFlight) await this.inFlight.catch(() => {});
		if (this.reported.size === 0) return;
		const transitions = [...this.reported.keys()].map(gone);
		await this.deliver(transitions);
	}

	stop(): void {
		this.stopped = true;
		this.store.off("change", this.onChange);
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}
}

function gone(terminalId: string): AgentStatusTransition {
	return {
		terminalId,
		workspaceId: "",
		workspaceName: "",
		state: "gone",
		sinceAt: Date.now(),
	};
}

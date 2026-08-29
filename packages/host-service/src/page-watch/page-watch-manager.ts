import type { EventBus } from "../events/event-bus.ts";
import { buildWatchPrompt } from "./buildPrompt.ts";
import { selectThreadsToDeliver } from "./trigger.ts";
import type {
	PageWatchAssignment,
	PageWatchEntry,
	PageWatchStatus,
	WatchedThread,
} from "./types.ts";

export const TICK_INTERVAL_MS = 5_000;
export const IDLE_AFTER_MS = 5 * 60_000;
export const IDLE_TICK_INTERVAL_MS = 60_000;
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const IDLE_TTL_MS = 2 * 60 * 60_000;
export const MAX_WATCHERS = 20;
export const MAX_CONSECUTIVE_FAILURES = 5;
export const MAX_HOLD_MS = 2 * 60_000;

export interface PageWatchApi {
	listThreads(pageId: string): Promise<WatchedThread[]>;
	setWatch(pageId: string, agentId: string | null): Promise<void>;
	clearWatch(pageId: string): Promise<void>;
}

export interface PageWatchDeps {
	api: PageWatchApi;
	sendToTerminal(input: {
		workspaceId: string;
		terminalId: string;
		text: string;
	}): Promise<void>;
	isTerminalAlive(terminalId: string): boolean;
	isAgentBusy(terminalId: string): boolean;
	hasAgent(terminalId: string): boolean;
	now?: () => number;
	setIntervalFn?: typeof setInterval;
	clearIntervalFn?: typeof clearInterval;
}

export class PageWatchManager {
	private readonly entries = new Map<string, PageWatchEntry>();
	private readonly deps: PageWatchDeps;
	private readonly now: () => number;
	private readonly setIntervalFn: typeof setInterval;
	private readonly clearIntervalFn: typeof clearInterval;
	private ticker: ReturnType<typeof setInterval> | null = null;
	private ticking = false;
	private tickRequested = false;
	private abort: AbortController | null = null;
	private removeTerminalListener: (() => void) | null = null;
	private eventBus: EventBus | null = null;

	constructor(deps: PageWatchDeps) {
		this.deps = deps;
		this.now = deps.now ?? Date.now;
		this.setIntervalFn = deps.setIntervalFn ?? setInterval;
		this.clearIntervalFn = deps.clearIntervalFn ?? clearInterval;
	}

	subscribeToTerminalEvents(eventBus: EventBus): void {
		this.eventBus = eventBus;
		this.removeTerminalListener?.();
		this.removeTerminalListener = eventBus.onTerminalLifecycle((message) => {
			if (message.eventType !== "exit") return;
			void this.dropTerminal(message.terminalId);
		});
	}

	async assign(assignment: PageWatchAssignment): Promise<void> {
		if (!this.deps.hasAgent(assignment.terminalId)) {
			throw new Error(
				"No agent is running in that terminal. A page is watched by an agent, not by a shell.",
			);
		}

		const existing = this.entries.get(assignment.pageId);
		if (!existing && this.entries.size >= MAX_WATCHERS) {
			throw new Error(
				`This host is already watching ${MAX_WATCHERS} pages. Stop one before starting another.`,
			);
		}

		await this.deps.api.setWatch(assignment.pageId, assignment.agentId);

		const at = this.now();
		this.entries.set(assignment.pageId, {
			...assignment,
			assignedAt: existing?.assignedAt ?? at,
			cursor: existing?.cursor ?? at,
			lastHumanCommentAt: at,
			lastHeartbeatAt: at,
			failures: 0,
			pings: existing?.pings ?? new Map(),
			pendingSince: null,
		});

		this.ensureTicking();
		this.notifyChanged(assignment.workspaceId);
	}

	async unwatch(pageId: string): Promise<void> {
		const entry = this.entries.get(pageId);
		if (!entry) return;
		this.entries.delete(pageId);
		this.stopTickingIfEmpty();
		this.notifyChanged(entry.workspaceId);
		await this.clearWatch(entry);
	}

	private async clearWatch(entry: PageWatchEntry): Promise<void> {
		try {
			await this.deps.api.clearWatch(entry.pageId);
		} catch (error) {
			console.warn(
				`[page-watch] could not clear the watch flag on ${entry.slug}`,
				error,
			);
		}
	}

	list(workspaceId?: string): PageWatchStatus[] {
		const out: PageWatchStatus[] = [];
		for (const entry of this.entries.values()) {
			if (workspaceId && entry.workspaceId !== workspaceId) continue;
			out.push({
				pageId: entry.pageId,
				slug: entry.slug,
				title: entry.title,
				workspaceId: entry.workspaceId,
				terminalId: entry.terminalId,
				agentId: entry.agentId,
				assignedAt: entry.assignedAt,
				lastHumanCommentAt: entry.lastHumanCommentAt,
				pendingSince: entry.pendingSince,
			});
		}
		return out;
	}

	stop(): void {
		this.removeTerminalListener?.();
		this.removeTerminalListener = null;
		this.stopTicking();
		this.entries.clear();
		this.eventBus = null;
	}

	private async dropTerminal(terminalId: string): Promise<void> {
		const dropped: PageWatchEntry[] = [];
		for (const [pageId, entry] of this.entries) {
			if (entry.terminalId !== terminalId) continue;
			this.entries.delete(pageId);
			dropped.push(entry);
		}
		if (dropped.length === 0) return;

		this.stopTickingIfEmpty();
		for (const entry of dropped) {
			this.notifyChanged(entry.workspaceId);
			await this.clearWatch(entry);
		}
	}

	private ensureTicking(): void {
		if (this.ticker) return;
		this.abort ??= new AbortController();
		this.ticker = this.setIntervalFn(() => {
			void this.tick();
		}, TICK_INTERVAL_MS);
		this.ticker.unref?.();
	}

	private stopTickingIfEmpty(): void {
		if (this.entries.size === 0) this.stopTicking();
	}

	private stopTicking(): void {
		this.tickRequested = false;
		if (this.ticker) {
			this.clearIntervalFn(this.ticker);
			this.ticker = null;
		}
		this.abort?.abort();
		this.abort = null;
	}

	async tick(): Promise<void> {
		if (this.ticking) {
			this.tickRequested = true;
			return;
		}
		this.ticking = true;
		try {
			for (const entry of [...this.entries.values()]) {
				await this.pollEntry(entry);
			}
		} finally {
			this.ticking = false;
		}

		if (!this.tickRequested) return;
		this.tickRequested = false;
		if (this.entries.size > 0) await this.tick();
	}

	private isDue(entry: PageWatchEntry, at: number): boolean {
		if (entry.pendingSince !== null) return true;
		const quiet = at - entry.lastHumanCommentAt > IDLE_AFTER_MS;
		if (!quiet) return true;
		return at - entry.lastHeartbeatAt >= IDLE_TICK_INTERVAL_MS;
	}

	private isCurrent(entry: PageWatchEntry): boolean {
		return this.entries.get(entry.pageId) === entry;
	}

	private async pollEntry(entry: PageWatchEntry): Promise<void> {
		if (!this.isCurrent(entry)) return;
		const at = this.now();

		if (
			!this.deps.isTerminalAlive(entry.terminalId) ||
			!this.deps.hasAgent(entry.terminalId)
		) {
			await this.dropTerminal(entry.terminalId);
			return;
		}

		if (at - entry.lastHumanCommentAt > IDLE_TTL_MS) {
			await this.unwatch(entry.pageId);
			return;
		}

		if (!this.isDue(entry, at)) return;

		let threads: WatchedThread[];
		try {
			threads = await this.deps.api.listThreads(entry.pageId);
		} catch (error) {
			await this.recordFailure(entry, error, "list");
			return;
		}

		if (!this.isCurrent(entry)) return;

		let result: ReturnType<typeof selectThreadsToDeliver>;
		let held = false;
		try {
			result = selectThreadsToDeliver(threads, entry);

			if (result.suppressed.length > 0) {
				console.warn(
					`[page-watch] ${entry.slug}: ping limit reached on ${result.suppressed.length} thread(s)`,
					{ threadIds: result.suppressed },
				);
			}

			if (result.fired.length > 0) {
				entry.pendingSince ??= at;
				held =
					this.deps.isAgentBusy(entry.terminalId) &&
					at - entry.pendingSince < MAX_HOLD_MS;
			}

			if (result.fired.length > 0 && !held) {
				await this.deps.sendToTerminal({
					workspaceId: entry.workspaceId,
					terminalId: entry.terminalId,
					text: buildWatchPrompt({
						title: entry.title,
						slug: entry.slug,
						threads: result.fired,
					}),
				});
			}
		} catch (error) {
			await this.recordFailure(entry, error, "send");
			return;
		}

		if (!this.isCurrent(entry)) return;

		entry.failures = 0;

		if (result.fired.length === 0) {
			if (result.suppressedCursor > entry.cursor) {
				entry.cursor = result.suppressedCursor;
			}
			entry.pendingSince = null;
		} else if (!held) {
			entry.pendingSince = null;
			entry.pings = result.pings;
			const delivered = Math.max(result.firedCursor, result.suppressedCursor);
			if (delivered > entry.cursor) {
				entry.cursor = delivered;
				entry.lastHumanCommentAt = at;
			}
		}

		await this.maybeHeartbeat(entry, at);
	}

	private async recordFailure(
		entry: PageWatchEntry,
		error: unknown,
		stage: "list" | "send" | "heartbeat",
	): Promise<void> {
		if (!this.isCurrent(entry)) return;
		entry.failures += 1;
		if (entry.failures < MAX_CONSECUTIVE_FAILURES) return;
		console.error(
			`[page-watch] giving up on ${entry.slug} after ${entry.failures} ${stage} failures`,
			{ error },
		);
		await this.unwatch(entry.pageId);
	}

	private async maybeHeartbeat(
		entry: PageWatchEntry,
		at: number,
	): Promise<void> {
		if (at - entry.lastHeartbeatAt < HEARTBEAT_INTERVAL_MS) return;
		entry.lastHeartbeatAt = at;
		try {
			await this.deps.api.setWatch(entry.pageId, entry.agentId);
		} catch (error) {
			await this.recordFailure(entry, error, "heartbeat");
		}
	}

	private notifyChanged(workspaceId: string): void {
		this.eventBus?.broadcastPageWatchChanged({
			workspaceId,
			occurredAt: this.now(),
		});
	}
}

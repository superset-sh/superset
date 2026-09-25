import type { EventBus } from "../events/event-bus.ts";
import { matchesAgentBinding } from "../terminal-agents/matches-agent-binding.ts";
import type { TerminalAgentBinding } from "../terminal-agents/types.ts";
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
const TAKEOVER_TIMEOUT_MS = 10_000;

export interface PageWatchApi {
	listThreads(pageId: string): Promise<WatchedThread[]>;
	claimWatch(input: {
		id: string;
		token: string;
		agentId: string | null;
	}): Promise<{
		token: string;
		seenCommentIds: string[];
		pings: Record<string, number>;
	}>;
	renewWatch(input: {
		id: string;
		token: string;
	}): Promise<{ current: boolean }>;
	releaseWatch(input: {
		id: string;
		token: string;
	}): Promise<{ released: boolean }>;
	reserveWatchDelivery(input: {
		id: string;
		token: string;
		commentIds: string[];
		pings: Record<string, number>;
	}): Promise<{ reservationId: string; leaseMs: number } | null>;
	finishWatchDelivery(input: {
		id: string;
		token: string;
		reservationId: string;
		delivered: boolean;
	}): Promise<{ current: boolean }>;
}
export interface PageWatchDeps {
	api: PageWatchApi;
	sendToTerminal(input: {
		workspaceId: string;
		terminalId: string;
		expectedAgent: TerminalAgentBinding;
		text: string;
		signal: AbortSignal;
		acquireDelivery: () => Promise<{ isValid: () => boolean } | null>;
	}): Promise<undefined | { inputStaged: true }>;
	isTerminalAlive(
		terminalId: string,
		workspaceId: string,
	): boolean | Promise<boolean>;
	isAgentBusy(terminalId: string): boolean;
	getAgent(terminalId: string): TerminalAgentBinding | undefined;
	now?: () => number;
	monotonicNow?: () => number;
	sleep?: (ms: number) => Promise<void>;
	setIntervalFn?: typeof setInterval;
	clearIntervalFn?: typeof clearInterval;
}
type PendingAssignment = PageWatchAssignment & { token: string };

export class PageWatchManager {
	private readonly entries = new Map<string, PageWatchEntry>();
	private readonly assignments = new Map<string, PendingAssignment>();
	private readonly claims = new Map<string, Promise<unknown>>();
	private readonly retired = new Set<PageWatchEntry>();
	private readonly polling = new Set<PageWatchEntry>();
	private readonly cleaning = new Set<PageWatchEntry>();
	private readonly cleanupFailures = new Map<PageWatchEntry, number>();
	private stopped = false;
	private readonly now: () => number;
	private readonly monotonicNow: () => number;
	private ticker: ReturnType<typeof setInterval> | null = null;
	private removeTerminalListener: (() => void) | null = null;
	private eventBus: EventBus | null = null;

	constructor(private readonly deps: PageWatchDeps) {
		this.now = deps.now ?? Date.now;
		this.monotonicNow = deps.monotonicNow ?? (() => performance.now());
	}
	subscribeToTerminalEvents(eventBus: EventBus): void {
		this.eventBus = eventBus;
		this.removeTerminalListener?.();
		this.removeTerminalListener = eventBus.onTerminalLifecycle((message) => {
			if (message.eventType === "exit")
				void this.dropTerminal(message.terminalId);
		});
	}

	private async validTarget(
		assignment: PageWatchAssignment,
		binding: TerminalAgentBinding,
	): Promise<boolean> {
		return (
			binding.terminalId === assignment.terminalId &&
			binding.workspaceId === assignment.workspaceId &&
			matchesAgentBinding(this.deps.getAgent(binding.terminalId), binding) &&
			(await this.deps.isTerminalAlive(
				assignment.terminalId,
				assignment.workspaceId,
			)) &&
			matchesAgentBinding(this.deps.getAgent(binding.terminalId), binding)
		);
	}
	async assign(assignment: PageWatchAssignment): Promise<void> {
		if (this.stopped) throw new Error("Page watcher has stopped");
		if (
			!this.entries.has(assignment.pageId) &&
			!this.assignments.has(assignment.pageId) &&
			new Set([...this.entries.keys(), ...this.assignments.keys()]).size >=
				MAX_WATCHERS
		)
			throw new Error(
				`This host is already watching ${MAX_WATCHERS} pages. Stop one before starting another.`,
			);
		if (this.stopped) throw new Error("Page watcher has stopped");
		const pending = { ...assignment, token: crypto.randomUUID() };
		this.assignments.set(assignment.pageId, pending);
		let claim:
			| Promise<Awaited<ReturnType<PageWatchApi["claimWatch"]>> | undefined>
			| undefined;
		try {
			const binding = this.deps.getAgent(assignment.terminalId);
			if (!binding || !(await this.validTarget(assignment, binding)))
				throw new Error("No agent is running in that workspace terminal");
			if (this.assignments.get(assignment.pageId) !== pending) return;
			const previous = this.claims.get(assignment.pageId) ?? Promise.resolve();
			claim = previous
				.catch(() => {})
				.then(async () => {
					const deadline = this.monotonicNow() + TAKEOVER_TIMEOUT_MS;
					while (this.assignments.get(assignment.pageId) === pending) {
						try {
							return await this.deps.api.claimWatch({
								id: assignment.pageId,
								token: pending.token,
								agentId: assignment.agentId,
							});
						} catch (error) {
							if (!this.isConflict(error) || this.monotonicNow() >= deadline)
								throw error;
							await (
								this.deps.sleep ??
								((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
							)(200);
						}
					}
					return undefined;
				});
			this.claims.set(assignment.pageId, claim);
			const state = await claim;
			if (!state) return;
			const valid = await this.validTarget(assignment, binding);
			if (this.assignments.get(assignment.pageId) !== pending || !valid) {
				await this.deps.api.releaseWatch({
					id: assignment.pageId,
					token: pending.token,
				});
				if (this.assignments.get(assignment.pageId) === pending)
					throw new Error(
						"The selected agent stopped before assignment completed",
					);
				return;
			}
			const old = this.entries.get(assignment.pageId);
			if (old) this.retire(old);
			const at = this.now();
			this.entries.set(assignment.pageId, {
				...assignment,
				token: pending.token,
				agentBinding: binding,
				abortController: new AbortController(),
				assignedAt: at,
				seenCommentIds: new Set(state.seenCommentIds),
				pings: new Map(Object.entries(state.pings)),
				pendingDelivery: null,
				lastHumanCommentAt: at,
				lastHeartbeatAt: at,
				lastPolledAt: at,
				failures: 0,
				pendingSince: null,
			});
			this.ensureTicking();
			this.notifyChanged(assignment.workspaceId);
		} finally {
			if (this.assignments.get(assignment.pageId) === pending)
				this.assignments.delete(assignment.pageId);
			if (this.claims.get(assignment.pageId) === claim)
				this.claims.delete(assignment.pageId);
		}
	}
	private errorCode(error: unknown): string | undefined {
		if (!error || typeof error !== "object") return undefined;
		const value = error as { code?: string; data?: { code?: string } };
		return value.data?.code ?? value.code;
	}
	private isConflict(error: unknown): boolean {
		return this.errorCode(error) === "CONFLICT";
	}
	private isPermanentFailure(error: unknown): boolean {
		return ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"].includes(
			this.errorCode(error) ?? "",
		);
	}
	async unwatch(pageId: string): Promise<void> {
		this.assignments.delete(pageId);
		const entry = this.entries.get(pageId);
		if (!entry) return;
		this.retire(entry);
		await this.cleanupEntry(entry);
	}
	private retire(entry: PageWatchEntry): void {
		entry.abortController.abort();
		if (this.isCurrent(entry)) this.entries.delete(entry.pageId);
		this.retired.add(entry);
		this.notifyChanged(entry.workspaceId);
		this.ensureTicking();
	}
	private async cleanupEntry(entry: PageWatchEntry): Promise<void> {
		if (this.polling.has(entry) || this.cleaning.has(entry)) return;
		this.cleaning.add(entry);
		try {
			await this.finishPending(entry);
			if (this.assignments.has(entry.pageId)) return;
			await this.deps.api.releaseWatch({
				id: entry.pageId,
				token: entry.token,
			});
			this.retired.delete(entry);
			this.cleanupFailures.delete(entry);
			this.notifyChanged(entry.workspaceId);
		} catch (error) {
			const failures = (this.cleanupFailures.get(entry) ?? 0) + 1;
			this.cleanupFailures.set(entry, failures);
			if (
				this.isPermanentFailure(error) ||
				failures >= MAX_CONSECUTIVE_FAILURES
			) {
				this.retired.delete(entry);
				this.cleanupFailures.delete(entry);
				console.warn(`[page-watch] could not release ${entry.slug}`, error);
			}
		} finally {
			this.cleaning.delete(entry);
			this.stopTickingIfEmpty();
		}
	}
	list(workspaceId?: string): PageWatchStatus[] {
		return [...this.entries.values()]
			.filter((entry) => !workspaceId || entry.workspaceId === workspaceId)
			.map(
				({
					pageId,
					slug,
					title,
					workspaceId,
					terminalId,
					agentId,
					assignedAt,
					lastHumanCommentAt,
					pendingSince,
				}) => ({
					pageId,
					slug,
					title,
					workspaceId,
					terminalId,
					agentId,
					assignedAt,
					lastHumanCommentAt,
					pendingSince,
				}),
			);
	}
	stop(): void {
		this.stopped = true;
		this.assignments.clear();
		this.removeTerminalListener?.();
		this.removeTerminalListener = null;
		for (const entry of this.entries.values()) this.retire(entry);
		for (const entry of this.retired) void this.cleanupEntry(entry);
		this.eventBus = null;
		this.stopTickingIfEmpty();
	}
	private async dropTerminal(terminalId: string): Promise<void> {
		for (const [pageId, assignment] of this.assignments)
			if (assignment.terminalId === terminalId) this.assignments.delete(pageId);
		await Promise.all(
			[...this.entries.values()]
				.filter((entry) => entry.terminalId === terminalId)
				.map(async (entry) => {
					this.retire(entry);
					await this.cleanupEntry(entry);
				}),
		);
	}
	private ensureTicking(): void {
		if (this.ticker) return;
		this.ticker = (this.deps.setIntervalFn ?? setInterval)(() => {
			void this.tick();
		}, TICK_INTERVAL_MS);
		this.ticker.unref?.();
	}
	private stopTickingIfEmpty(): void {
		if (this.entries.size || this.retired.size || !this.ticker) return;
		(this.deps.clearIntervalFn ?? clearInterval)(this.ticker);
		this.ticker = null;
	}
	async tick(): Promise<void> {
		await Promise.all(
			[...this.entries.values()].map(async (entry) => {
				if (this.polling.has(entry)) return;
				this.polling.add(entry);
				try {
					await this.pollEntry(entry);
				} catch (error) {
					await this.recordFailure(entry, error);
				} finally {
					this.polling.delete(entry);
				}
			}),
		);
		await Promise.all(
			[...this.retired].map((entry) => this.cleanupEntry(entry)),
		);
	}
	private isCurrent(entry: PageWatchEntry): boolean {
		return this.entries.get(entry.pageId) === entry;
	}
	private async finishPending(entry: PageWatchEntry): Promise<void> {
		const pending = entry.pendingDelivery;
		if (!pending) return;
		const result = await this.deps.api.finishWatchDelivery({
			id: entry.pageId,
			token: entry.token,
			reservationId: pending.reservationId,
			delivered: pending.delivered,
		});
		if (!result.current) {
			entry.pendingDelivery = null;
			if (this.isCurrent(entry)) this.retire(entry);
			return;
		}
		if (pending.delivered) {
			for (const id of pending.commentIds) entry.seenCommentIds.add(id);
			for (const [id, count] of pending.pings) entry.pings.set(id, count);
			entry.lastHumanCommentAt = this.now();
		}
		entry.pendingDelivery = null;
	}
	private async pollEntry(entry: PageWatchEntry): Promise<void> {
		if (!this.isCurrent(entry)) return;
		await this.finishPending(entry);
		if (!this.isCurrent(entry)) return;
		if (!(await this.validTarget(entry, entry.agentBinding))) {
			this.retire(entry);
			return;
		}
		const at = this.now();
		if (at - (entry.pendingSince ?? entry.lastHumanCommentAt) > IDLE_TTL_MS) {
			this.retire(entry);
			return;
		}
		if (at - entry.lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
			const renewed = await this.deps.api.renewWatch({
				id: entry.pageId,
				token: entry.token,
			});
			if (!renewed.current) {
				this.retire(entry);
				return;
			}
			entry.lastHeartbeatAt = at;
		}
		if (!this.isCurrent(entry)) return;
		if (
			entry.pendingSince === null &&
			at - entry.lastHumanCommentAt > IDLE_AFTER_MS &&
			at - entry.lastPolledAt < IDLE_TICK_INTERVAL_MS
		)
			return;
		const threads = await this.deps.api.listThreads(entry.pageId);
		entry.lastPolledAt = at;
		if (!this.isCurrent(entry)) return;
		const result = selectThreadsToDeliver(threads, entry);
		if (result.commentIds.length === 0) {
			entry.pendingSince = null;
			entry.failures = 0;
			return;
		}
		entry.pendingSince ??= at;
		if (this.deps.isAgentBusy(entry.terminalId)) {
			entry.failures = 0;
			return;
		}
		const acquireDelivery = async () => {
			if (
				!this.isCurrent(entry) ||
				this.assignments.has(entry.pageId) ||
				this.deps.isAgentBusy(entry.terminalId)
			)
				return null;
			const started = this.monotonicNow();
			const startedAt = this.now();
			const reservation = await this.deps.api.reserveWatchDelivery({
				id: entry.pageId,
				token: entry.token,
				commentIds: result.commentIds,
				pings: Object.fromEntries(result.pings),
			});
			if (!reservation) {
				this.retire(entry);
				return null;
			}
			entry.pendingDelivery = {
				reservationId: reservation.reservationId,
				commentIds: result.commentIds,
				pings: result.pings,
				delivered: false,
			};
			return {
				isValid: () => {
					const elapsed = this.monotonicNow() - started;
					const wallElapsed = this.now() - startedAt;
					return (
						this.isCurrent(entry) &&
						!this.assignments.has(entry.pageId) &&
						!entry.abortController.signal.aborted &&
						elapsed >= 0 &&
						elapsed < reservation.leaseMs &&
						wallElapsed >= 0 &&
						wallElapsed < reservation.leaseMs &&
						!this.deps.isAgentBusy(entry.terminalId)
					);
				},
			};
		};
		try {
			if (result.fired.length > 0) {
				const sent = await this.deps.sendToTerminal({
					workspaceId: entry.workspaceId,
					terminalId: entry.terminalId,
					expectedAgent: entry.agentBinding,
					text: buildWatchPrompt({
						title: entry.title,
						slug: entry.slug,
						pageId: entry.pageId,
						threads: result.fired,
					}),
					signal: entry.abortController.signal,
					acquireDelivery,
				});
				if (sent?.inputStaged) {
					this.retire(entry);
					return;
				}
			} else {
				const delivery = await acquireDelivery();
				if (!delivery?.isValid())
					throw new Error("Page delivery ownership changed");
			}
			if (entry.pendingDelivery) entry.pendingDelivery.delivered = true;
		} finally {
			await this.finishPending(entry);
		}
		entry.pendingSince = null;
		entry.failures = 0;
	}
	private async recordFailure(
		entry: PageWatchEntry,
		error: unknown,
	): Promise<void> {
		if (!this.isCurrent(entry)) return;
		entry.failures++;
		if (
			!this.isPermanentFailure(error) &&
			entry.failures < MAX_CONSECUTIVE_FAILURES
		)
			return;
		console.error(
			`[page-watch] giving up on ${entry.slug} after ${entry.failures} failures`,
			{ error },
		);
		this.retire(entry);
	}
	private notifyChanged(workspaceId: string): void {
		this.eventBus?.broadcastPageWatchChanged({
			workspaceId,
			occurredAt: this.now(),
		});
	}
}

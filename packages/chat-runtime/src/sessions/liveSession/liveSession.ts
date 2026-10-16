import { randomUUID } from "node:crypto";
import type {
	DurableEvent,
	Envelope,
	SessionState,
	Turn,
	UsageLimit,
	UsageLimitAction,
	UserContent,
	UserMessage,
} from "@superset/chat/protocol";
import { sessionStateSchema } from "@superset/chat/protocol";
import type {
	AdapterEvent,
	HarnessAdapter,
	HarnessStartOptions,
} from "../../harness";
import type { ChatJournal } from "../../journal";

export type LiveSessionOptions = {
	sessionId: string;
	scopeId: string;
	harness: string;
	terminalId?: string;
	journal: ChatJournal;
	publish: (envelope: Envelope) => void;
	adapter: HarnessAdapter;
	mintId?: () => string;
	now?: () => number;
	/** How long after a usage limit's reset the host waits before continuing. */
	usageLimitGraceMs?: number;
};

/** Providers can still refuse right at the reset; give them a moment. */
export const USAGE_LIMIT_GRACE_MS = 30_000;

/** The most a timer can wait; a reset further out is re-armed when it fires. */
const MAX_TIMER_MS = 2_147_483_647;

/** Adapters that only see the refusal as an error carry its text. */
const USAGE_LIMIT_TEXT =
	/(?:usage|spending|monthly|weekly|daily) limit (?:reached|exceeded)|(?:quota|credits?) (?:exceeded|exhausted|depleted)|insufficient[_ ](?:quota|credits)|hit your (?:usage )?limit|credit balance is too low/i;

const CONTINUE_PROMPT: UserContent[] = [{ type: "text", text: "Continue" }];

export type PromptResult = {
	itemId: string;
	queued: boolean;
};

export type QueueState = {
	paused: boolean;
	prompts: {
		itemId: string;
		clientId: string | undefined;
		content: UserContent[];
		queuedAtMs: number;
	}[];
};

type PendingPrompt = {
	item: UserMessage;
	content: UserContent[];
	turnId: string;
	seq: number;
};

function withoutQueued(item: UserMessage): UserMessage {
	const next = { ...item };
	delete next.queued;
	return next;
}

export class LiveSession {
	private readonly queue: PendingPrompt[] = [];
	private readonly pendingSteers: PendingPrompt[] = [];
	private steering: Promise<void> = Promise.resolve();
	private sent = 0;
	private awaitingTurn: PendingPrompt | null = null;
	private steerTarget: string | null = null;
	private queuePaused = false;
	private resumeTimer: ReturnType<typeof setTimeout> | null = null;
	private sessionState: SessionState;
	private currentTurn: Turn | null = null;
	private pump: Promise<void> | null = null;
	private stopped = false;

	constructor(private readonly options: LiveSessionOptions) {
		this.sessionState = { status: "starting", harness: options.harness };
	}

	get sessionId(): string {
		return this.options.sessionId;
	}

	get scopeId(): string {
		return this.options.scopeId;
	}

	get terminalId(): string | undefined {
		return this.options.terminalId;
	}

	get state(): SessionState {
		return this.sessionState;
	}

	get turn(): Turn | null {
		return this.currentTurn;
	}

	get queuedCount(): number {
		return this.queue.length;
	}

	start(startOptions: HarnessStartOptions): void {
		this.emitSession({ status: "starting", queueControls: true });
		this.pump = this.run(this.options.adapter.start(startOptions)).catch(
			(error: unknown) => {
				try {
					this.fail(error);
				} catch {
					this.stopped = true;
				}
			},
		);
	}

	prompt(
		content: UserContent[],
		clientId: string,
		steerTurnId?: string,
	): PromptResult {
		const itemId = this.mintId();
		const seq = ++this.sent;
		const wantsSteer =
			steerTurnId !== undefined ||
			this.sessionState.awaitingBackground === true;
		const running =
			wantsSteer && this.queue.length === 0
				? this.steerableTurn(steerTurnId)
				: null;
		if (running) {
			const item: UserMessage = {
				id: itemId,
				kind: "user_message",
				clientId,
				startedAtMs: this.now(),
				content,
			};
			this.injectInto(running, {
				item,
				content,
				turnId: this.mintId(),
				seq,
			});
			return { itemId, queued: false };
		}
		const limited = this.sessionState.usageLimit !== undefined;
		const queued = this.isBusy() || limited;
		const item: UserMessage = {
			id: itemId,
			kind: "user_message",
			clientId,
			startedAtMs: this.now(),
			content,
			...(queued ? { queued: true } : {}),
		};
		const turnId = this.mintId();
		if (queued) {
			this.queue.push({ item, content, turnId, seq });
			this.appendDurable({ type: "item", item, turnId });
			if (limited && !this.queuePaused) {
				this.queuePaused = true;
				this.emitSession({ queuePaused: true });
			}
			if (
				steerTurnId &&
				this.currentTurn?.id === steerTurnId &&
				this.currentTurn.status === "running"
			) {
				this.steerQueued(itemId);
			}
			return { itemId, queued: true };
		}
		this.appendDurable({ type: "item", item, turnId });
		this.deliver({ item, content, turnId, seq });
		return { itemId, queued: false };
	}

	removeQueued(itemId: string): void {
		const index = this.requireQueuedIndex(itemId);
		const [removed] = this.queue.splice(index, 1);
		if (!removed) return;
		if (this.steerTarget === itemId) this.steerTarget = null;
		this.discard(removed);
		this.unpauseIfEmpty();
	}

	steerQueued(itemId: string): void {
		const index = this.requireQueuedIndex(itemId);
		const [steered] = this.queue.splice(index, 1);
		if (!steered) return;
		const running = this.steerableTurn();
		if (running) {
			if (this.steerTarget === itemId) this.steerTarget = null;
			if (this.queuePaused) {
				this.queuePaused = false;
				this.emitSession({ queuePaused: false });
			}
			this.injectInto(
				running,
				{ ...steered, item: this.delivered(steered.item) },
				true,
			);
			return;
		}
		this.steerFirst(steered);
	}

	private steerFirst(steered: PendingPrompt): void {
		this.queue.unshift(steered);
		if (this.queuePaused) {
			this.queuePaused = false;
			this.emitSession({ queuePaused: false });
		}
		if (this.currentTurn?.status === "running") {
			this.steerTarget = steered.item.id;
			this.options.adapter.cancelTurn();
		} else if (this.awaitingTurn) {
			this.steerTarget = steered.item.id;
		} else {
			this.queue.shift();
			this.deliver(steered);
		}
	}

	get queueState(): QueueState {
		return {
			paused: this.queuePaused,
			prompts: this.queue.map(({ item }) => ({
				itemId: item.id,
				clientId: item.clientId,
				content: item.content,
				queuedAtMs: item.startedAtMs,
			})),
		};
	}

	resumeQueue(): void {
		const limited = this.sessionState.usageLimit !== undefined;
		if (!this.queuePaused && !limited) return;
		this.clearResumeTimer();
		this.queuePaused = false;
		this.emitSession({ queuePaused: false, usageLimit: undefined });
		if (this.currentTurn?.status !== "running" && !this.awaitingTurn) {
			this.deliverNextQueued();
		}
	}

	/**
	 * Resuming after a limit continues the work the refusal cut short: the
	 * next queued prompt if there is one, else a plain "Continue".
	 */
	respondToUsageLimit(action: UsageLimitAction): void {
		const limit = this.sessionState.usageLimit;
		if (this.stopped || !limit) return;
		switch (action) {
			case "resume":
				this.resumeAfterLimit();
				return;
			case "dismiss":
				this.clearResumeTimer();
				this.emitSession({ usageLimit: undefined });
				return;
			case "resume_at_reset":
				if (limit.resetsAtMs === undefined) return;
				this.emitSession({ usageLimit: { ...limit, resumeAtReset: true } });
				this.armResumeTimer(limit.resetsAtMs);
				return;
			case "cancel_resume_at_reset":
				this.clearResumeTimer();
				this.emitSession({ usageLimit: { ...limit, resumeAtReset: false } });
				return;
		}
	}

	private resumeAfterLimit(): void {
		const idle = this.currentTurn?.status !== "running" && !this.awaitingTurn;
		this.resumeQueue();
		if (idle && this.queue.length === 0 && !this.awaitingTurn) {
			this.prompt(CONTINUE_PROMPT, this.mintId());
		}
	}

	private armResumeTimer(resetsAtMs: number): void {
		this.clearResumeTimer();
		const grace = this.options.usageLimitGraceMs ?? USAGE_LIMIT_GRACE_MS;
		const wait = resetsAtMs + grace - this.now();
		this.resumeTimer = setTimeout(
			() => {
				this.resumeTimer = null;
				if (this.stopped || !this.sessionState.usageLimit?.resumeAtReset) {
					return;
				}
				if (this.now() < resetsAtMs + grace) {
					this.armResumeTimer(resetsAtMs);
					return;
				}
				this.resumeAfterLimit();
			},
			Math.min(Math.max(wait, 0), MAX_TIMER_MS),
		);
	}

	private clearResumeTimer(): void {
		if (this.resumeTimer === null) return;
		clearTimeout(this.resumeTimer);
		this.resumeTimer = null;
	}

	/** A refused turn stops the queue until someone chooses to go on. */
	private limitReached(limit: UsageLimit): void {
		if (this.queue.length > 0 && !this.queuePaused) this.queuePaused = true;
		this.emitSession({ queuePaused: this.queuePaused, usageLimit: limit });
	}

	cancelTurn(turnId?: string, pauseQueue = false): void {
		if (turnId && this.currentTurn && this.currentTurn.id !== turnId) return;
		const steering =
			this.steerTarget !== null && this.queue[0]?.item.id === this.steerTarget;
		const waiting = this.queue.length + this.pendingSteers.length;
		if (pauseQueue && !steering && waiting > 0 && !this.queuePaused) {
			this.queuePaused = true;
			this.emitSession({ queuePaused: true });
		}
		this.options.adapter.cancelTurn();
	}

	respondToApproval(
		approvalId: string,
		decision: Parameters<HarnessAdapter["respondToApproval"]>[1],
	): void {
		this.options.adapter.respondToApproval(approvalId, decision);
	}

	setMode(modeId: string): void {
		this.options.adapter.setMode(modeId);
	}

	setConfigOption(configId: string, value: string): void {
		if (!this.options.adapter.setConfigOption) {
			throw new Error("this agent has no settings to change");
		}
		this.options.adapter.setConfigOption(configId, value);
	}

	stopBackgroundTask(taskId: string): Promise<boolean> {
		return (
			this.options.adapter.stopBackgroundTask?.(taskId) ??
			Promise.resolve(false)
		);
	}

	fork(): Promise<string | null> {
		return this.options.adapter.fork?.() ?? Promise.resolve(null);
	}

	async dispose(): Promise<void> {
		this.stopped = true;
		this.clearResumeTimer();
		this.discardPending();
		await this.options.adapter.dispose();
		await this.pump;
	}

	private async run(stream: AsyncIterable<AdapterEvent>): Promise<void> {
		try {
			for await (const event of stream) {
				if (this.stopped) return;
				this.handle(event);
			}
		} finally {
			this.stopped = true;
			this.clearResumeTimer();
		}
	}

	private handle(event: AdapterEvent): void {
		switch (event.kind) {
			case "item":
				this.appendDurable({
					type: "item",
					item: event.item,
					turnId: event.turnId,
				});
				return;
			case "turn": {
				this.currentTurn = event.turn;
				this.appendDurable({ type: "turn", turn: event.turn });
				const limitText =
					event.turn.status === "failed" &&
					USAGE_LIMIT_TEXT.test(event.turn.error?.message ?? "");
				if (limitText && !this.sessionState.usageLimit) {
					this.limitReached({ hitAtMs: this.now() });
				}
				if (event.turn.status === "running") {
					this.attributeAwaitingPrompt(event.turn.id);
					const steered = this.steerTarget;
					this.steerTarget = null;
					if (steered && this.queue[0]?.item.id === steered) {
						this.options.adapter.cancelTurn();
					}
				} else {
					this.deliverNextQueued();
				}
				return;
			}
			case "session":
				if (event.session.status === "dead") {
					this.stopped = true;
					this.clearResumeTimer();
					this.discardPending();
				}
				if (event.session.usageLimit) {
					const { usageLimit, ...rest } = event.session;
					this.emitSession(rest);
					this.limitReached(usageLimit);
				} else {
					this.emitSession(event.session);
				}
				if (event.session.awaitingBackground) this.steerQueueIntoHeldTurn();
				return;
			case "delta":
				this.options.publish({
					v: 1,
					sessionId: this.options.sessionId,
					ts: this.now(),
					delta: event.delta,
				});
				return;
		}
	}

	private attributeAwaitingPrompt(turnId: string): void {
		const awaiting = this.awaitingTurn;
		if (!awaiting) return;
		this.awaitingTurn = null;
		this.appendDurable({
			type: "item",
			item: withoutQueued(awaiting.item),
			turnId,
		});
	}

	private deliver(prompt: PendingPrompt): void {
		this.awaitingTurn = prompt;
		try {
			this.options.adapter.prompt(prompt.content);
		} catch (error) {
			this.awaitingTurn = null;
			if (prompt.item.queued) this.discard(prompt);
			throw error;
		}
	}

	private steerableTurn(expectedTurnId?: string): Turn | null {
		const turn = this.currentTurn;
		if (turn?.status !== "running" || this.awaitingTurn) return null;
		if (expectedTurnId && expectedTurnId !== turn.id) return null;
		return this.options.adapter.canSteer?.() ? turn : null;
	}

	private delivered(item: UserMessage): UserMessage {
		return { ...withoutQueued(item), startedAtMs: this.now() };
	}

	private steerQueueIntoHeldTurn(): void {
		if (this.queuePaused) return;
		const turn = this.steerableTurn();
		if (!turn) return;
		for (const queued of this.queue.splice(0)) {
			if (this.steerTarget === queued.item.id) this.steerTarget = null;
			this.injectInto(turn, { ...queued, item: this.delivered(queued.item) });
		}
	}

	private injectInto(
		turn: Turn,
		prompt: PendingPrompt,
		selected = false,
	): void {
		this.appendDurable({ type: "item", item: prompt.item, turnId: turn.id });
		this.pendingSteers.push(prompt);
		this.steering = this.steering.then(async () => {
			if (this.stopped) return;
			const mayDispatch =
				this.currentTurn?.id === turn.id &&
				(selected || (this.queue.length === 0 && !this.queuePaused));
			const taken =
				mayDispatch &&
				(await Promise.resolve(this.options.adapter.steer?.(prompt.content))
					.then(Boolean)
					.catch(() => false));
			const index = this.pendingSteers.indexOf(prompt);
			if (index === -1) return;
			this.pendingSteers.splice(index, 1);
			if (!taken) this.fallBack(prompt, selected);
			if (this.currentTurn?.status !== "running" && !this.awaitingTurn) {
				this.deliverNextQueued();
			}
		});
	}

	private fallBack(prompt: PendingPrompt, selected: boolean): void {
		const item: UserMessage = { ...prompt.item, queued: true };
		const pending = { ...prompt, item };
		this.appendDurable({ type: "item", item, turnId: prompt.turnId });
		if (selected) {
			this.steerFirst(pending);
			return;
		}
		const later = this.queue.findIndex(
			(queued) =>
				queued.seq > prompt.seq && queued.item.id !== this.steerTarget,
		);
		this.queue.splice(later === -1 ? this.queue.length : later, 0, pending);
	}

	private fail(error: unknown): void {
		this.stopped = true;
		this.clearResumeTimer();
		const failedAtMs = this.now();
		const turn = this.currentTurn;
		if (turn?.status === "running") {
			this.currentTurn = {
				...turn,
				status: "interrupted",
				completedAtMs: failedAtMs,
			};
			this.appendDurable({ type: "turn", turn: this.currentTurn });
		}
		this.discardPending();
		this.appendDurable({
			type: "item",
			item: {
				id: this.mintId(),
				kind: "notice",
				noticeKind: "error",
				text: error instanceof Error ? error.message : String(error),
				startedAtMs: failedAtMs,
				completedAtMs: failedAtMs,
			},
			turnId: turn?.id ?? this.mintId(),
		});
		this.emitSession({ status: "dead" });
	}

	private discard(prompt: PendingPrompt): void {
		this.appendDurable({
			type: "item",
			item: { ...withoutQueued(prompt.item), discarded: true },
			turnId: prompt.turnId,
		});
	}

	private discardPending(): void {
		const pending = [
			...(this.awaitingTurn?.item.queued ? [this.awaitingTurn] : []),
			...this.pendingSteers,
			...this.queue,
		];
		this.queue.length = 0;
		this.pendingSteers.length = 0;
		this.awaitingTurn = null;
		this.steerTarget = null;
		for (const prompt of pending) this.discard(prompt);
	}

	private requireQueuedIndex(itemId: string): number {
		const index = this.queue.findIndex((pending) => pending.item.id === itemId);
		if (index === -1) throw new Error(`prompt ${itemId} is not queued`);
		return index;
	}

	private deliverNextQueued(): void {
		if (this.queuePaused) return;
		const next = this.queue.shift();
		if (!next) return;
		this.deliver(next);
	}

	private unpauseIfEmpty(): void {
		if (!this.queuePaused || this.queue.length > 0) return;
		this.queuePaused = false;
		this.emitSession({ queuePaused: false });
	}

	private emitSession(partial: Partial<SessionState>): void {
		const merged: SessionState = { ...this.sessionState, ...partial };
		const status = this.hasPendingWork() ? "running" : merged.status;
		this.sessionState = sessionStateSchema.parse({ ...merged, status });
		this.appendDurable({ type: "session", session: this.sessionState });
	}

	private appendDurable(event: DurableEvent): void {
		this.options.publish(
			this.options.journal.appendEnvelope(this.options.sessionId, event),
		);
	}

	private hasPendingWork(): boolean {
		return (
			(this.queue.length > 0 && !this.queuePaused) || this.awaitingTurn !== null
		);
	}

	private isBusy(): boolean {
		return (
			this.currentTurn?.status === "running" ||
			this.hasPendingWork() ||
			this.pendingSteers.length > 0
		);
	}

	private mintId(): string {
		return (this.options.mintId ?? randomUUID)();
	}

	private now(): number {
		return (this.options.now ?? Date.now)();
	}
}

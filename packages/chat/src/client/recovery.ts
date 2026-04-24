/**
 * Chat stream recovery coordinator.
 *
 * Tracks sequence numbers on incoming ChatStreamEvents, detects gaps
 * (disconnect, reorder, partial-stream), and schedules snapshot + replay
 * to restore consistency. Pure TypeScript — no framework coupling, no
 * network calls. Callers wire this into their tRPC subscription loop.
 *
 * Ported from t3code's `orchestrationRecovery.ts`
 * (see temp/t3code/apps/web/src/orchestrationRecovery.ts) and adapted by
 * renaming the "domain event" terminology to just "event" — our events
 * are chat stream events, not a separate domain event layer.
 *
 * See plans/20260421-v2-chat-refactor-phased-plan.md Phase 0.3 and Phase 6.
 *
 * # Contract
 *
 * Every ChatStreamEvent carries a monotonically increasing `sequence: number`
 * per session. The coordinator holds four pieces of state:
 *
 * - `latestSequence`: highest sequence that has been applied.
 * - `highestObservedSequence`: highest sequence we've seen classified, even
 *   if deferred / recovered rather than applied.
 * - `bootstrapped`: true after the initial snapshot has completed.
 * - `inFlight`: the current recovery phase ("snapshot" | "replay"), if any.
 *
 * # Usage
 *
 * ```ts
 * const coord = createChatRecoveryCoordinator();
 *
 * // On subscribe
 * coord.beginSnapshotRecovery("bootstrap");
 * const snap = await fetchSnapshot();
 * coord.completeSnapshotRecovery(snap.latestSequence);
 *
 * // On each event
 * const decision = coord.classifyEvent(event.sequence);
 * if (decision === "apply") store.apply(event);
 * if (decision === "recover") await replay();
 *
 * // On stream disconnect + reconnect
 * coord.beginSnapshotRecovery("resubscribe");
 * ...
 * ```
 */

export type ChatRecoveryReason =
	| "bootstrap"
	| "sequence-gap"
	| "resubscribe"
	| "replay-failed";

export interface ChatRecoveryPhase {
	kind: "snapshot" | "replay";
	reason: ChatRecoveryReason;
}

export interface ChatRecoveryState {
	latestSequence: number;
	highestObservedSequence: number;
	bootstrapped: boolean;
	pendingReplay: boolean;
	inFlight: ChatRecoveryPhase | null;
}

export type EventClassification = "ignore" | "defer" | "recover" | "apply";

export interface ReplayRecoveryCompletion {
	replayMadeProgress: boolean;
	shouldReplay: boolean;
}

export interface ReplayRetryTracker {
	attempts: number;
	latestSequence: number;
	highestObservedSequence: number;
}

export interface ReplayRetryDecision {
	shouldRetry: boolean;
	delayMs: number;
	tracker: ReplayRetryTracker | null;
}

type SequencedEvent = Readonly<{ sequence: number }>;

/**
 * Derive whether a replay should be retried after a completion.
 *
 * - progress made → retry immediately (delay 0).
 * - no progress + frontier unchanged → exponential backoff up to
 *   maxNoProgressRetries, then give up.
 * - no progress + frontier moved → reset attempts and retry.
 */
export function deriveReplayRetryDecision(input: {
	previousTracker: ReplayRetryTracker | null;
	completion: ReplayRecoveryCompletion;
	recoveryState: Pick<
		ChatRecoveryState,
		"latestSequence" | "highestObservedSequence"
	>;
	baseDelayMs: number;
	maxNoProgressRetries: number;
}): ReplayRetryDecision {
	if (!input.completion.shouldReplay) {
		return {
			shouldRetry: false,
			delayMs: 0,
			tracker: null,
		};
	}

	if (input.completion.replayMadeProgress) {
		return {
			shouldRetry: true,
			delayMs: 0,
			tracker: null,
		};
	}

	const previousTracker = input.previousTracker;
	const sameFrontier =
		previousTracker !== null &&
		previousTracker.latestSequence === input.recoveryState.latestSequence &&
		previousTracker.highestObservedSequence ===
			input.recoveryState.highestObservedSequence;

	const attempts =
		sameFrontier && previousTracker !== null ? previousTracker.attempts + 1 : 1;
	if (attempts > input.maxNoProgressRetries) {
		return {
			shouldRetry: false,
			delayMs: 0,
			tracker: null,
		};
	}

	return {
		shouldRetry: true,
		delayMs: input.baseDelayMs * 2 ** (attempts - 1),
		tracker: {
			attempts,
			latestSequence: input.recoveryState.latestSequence,
			highestObservedSequence: input.recoveryState.highestObservedSequence,
		},
	};
}

export interface ChatRecoveryCoordinator {
	getState(): ChatRecoveryState;
	/**
	 * Classify an incoming event by its sequence number.
	 *
	 * - `"ignore"`: already applied (seq <= latestSequence).
	 * - `"defer"`: not bootstrapped yet, or a recovery phase is in flight. Queue.
	 * - `"recover"`: gap detected — trigger replay. Event also queued.
	 * - `"apply"`: next in order — apply immediately.
	 */
	classifyEvent(sequence: number): EventClassification;
	/**
	 * Apply a batch of events. Filters to sequences > latestSequence, sorts,
	 * and advances latestSequence to the highest applied. Returns the accepted
	 * subset so callers can apply them in the same order.
	 */
	markEventBatchApplied<T extends SequencedEvent>(
		events: ReadonlyArray<T>,
	): ReadonlyArray<T>;
	beginSnapshotRecovery(reason: ChatRecoveryReason): boolean;
	/** Returns whether a replay should now be started. */
	completeSnapshotRecovery(snapshotSequence: number): boolean;
	failSnapshotRecovery(): void;
	beginReplayRecovery(reason: ChatRecoveryReason): boolean;
	completeReplayRecovery(): ReplayRecoveryCompletion;
	failReplayRecovery(): void;
}

export function createChatRecoveryCoordinator(): ChatRecoveryCoordinator {
	const state: ChatRecoveryState = {
		latestSequence: 0,
		highestObservedSequence: 0,
		bootstrapped: false,
		pendingReplay: false,
		inFlight: null,
	};
	let replayStartSequence: number | null = null;

	const snapshotState = (): ChatRecoveryState => ({
		...state,
		...(state.inFlight ? { inFlight: { ...state.inFlight } } : {}),
	});

	const observeSequence = (sequence: number) => {
		state.highestObservedSequence = Math.max(
			state.highestObservedSequence,
			sequence,
		);
	};

	const resolveReplayNeedAfterRecovery = () => {
		const pendingReplayBeforeReset = state.pendingReplay;
		const observedAhead =
			state.highestObservedSequence > state.latestSequence;
		const shouldReplay = pendingReplayBeforeReset || observedAhead;
		state.pendingReplay = false;
		return {
			shouldReplay,
			pendingReplayBeforeReset,
			observedAhead,
		};
	};

	return {
		getState(): ChatRecoveryState {
			return snapshotState();
		},

		classifyEvent(sequence: number): EventClassification {
			observeSequence(sequence);
			if (sequence <= state.latestSequence) {
				return "ignore";
			}
			if (!state.bootstrapped || state.inFlight) {
				state.pendingReplay = true;
				return "defer";
			}
			if (sequence !== state.latestSequence + 1) {
				state.pendingReplay = true;
				return "recover";
			}
			return "apply";
		},

		markEventBatchApplied<T extends SequencedEvent>(
			events: ReadonlyArray<T>,
		): ReadonlyArray<T> {
			const nextEvents = [
				...events.filter((event) => event.sequence > state.latestSequence),
			].sort((left, right) => left.sequence - right.sequence);
			if (nextEvents.length === 0) {
				return [];
			}

			state.latestSequence =
				nextEvents.at(-1)?.sequence ?? state.latestSequence;
			state.highestObservedSequence = Math.max(
				state.highestObservedSequence,
				state.latestSequence,
			);
			return nextEvents;
		},

		beginSnapshotRecovery(reason: ChatRecoveryReason): boolean {
			if (state.inFlight?.kind === "snapshot") {
				state.pendingReplay = true;
				return false;
			}
			if (state.inFlight?.kind === "replay") {
				state.pendingReplay = true;
				return false;
			}
			state.inFlight = { kind: "snapshot", reason };
			return true;
		},

		completeSnapshotRecovery(snapshotSequence: number): boolean {
			state.latestSequence = Math.max(
				state.latestSequence,
				snapshotSequence,
			);
			state.highestObservedSequence = Math.max(
				state.highestObservedSequence,
				state.latestSequence,
			);
			state.bootstrapped = true;
			state.inFlight = null;
			return resolveReplayNeedAfterRecovery().shouldReplay;
		},

		failSnapshotRecovery(): void {
			state.inFlight = null;
		},

		beginReplayRecovery(reason: ChatRecoveryReason): boolean {
			if (!state.bootstrapped || state.inFlight?.kind === "snapshot") {
				state.pendingReplay = true;
				return false;
			}
			if (state.inFlight?.kind === "replay") {
				state.pendingReplay = true;
				return false;
			}
			state.pendingReplay = false;
			replayStartSequence = state.latestSequence;
			state.inFlight = { kind: "replay", reason };
			return true;
		},

		completeReplayRecovery(): ReplayRecoveryCompletion {
			const replayMadeProgress =
				replayStartSequence !== null &&
				state.latestSequence > replayStartSequence;
			replayStartSequence = null;
			state.inFlight = null;
			const replayResolution = resolveReplayNeedAfterRecovery();
			return {
				replayMadeProgress,
				shouldReplay: replayResolution.shouldReplay,
			};
		},

		failReplayRecovery(): void {
			replayStartSequence = null;
			state.bootstrapped = false;
			state.inFlight = null;
		},
	};
}

/**
 * Phase 6 client-side stream subscriber.
 *
 * Wires a tRPC observable (or any event source with a subscribe/unsubscribe
 * shape) into the chatStore through the recovery coordinator. Transport-
 * agnostic — tests inject a fake `subscribe` + `fetchSnapshot`; production
 * passes the tRPC client functions.
 *
 * Flow per event:
 *   coordinator.classifyEvent(seq) →
 *     "ignore"  → drop (we've already applied or it's stale).
 *     "apply"   → push to store.applyStreamEvent.
 *     "defer"   → buffer (snapshot-in-progress or not-bootstrapped).
 *     "recover" → trigger snapshot-then-replay, event stays buffered
 *                 until the snapshot completes.
 *
 * After every snapshot completes, we try to apply the buffered queue
 * in sequence. Events whose sequence is still gapped stay buffered for
 * the next recovery cycle or until the gap fills via the live stream.
 *
 * Plan reference: 20260421-v2-chat-refactor-phased-plan.md §6.
 */

import type { ChatStreamEvent } from "../shared/events";
import {
	type ChatRecoveryCoordinator,
	createChatRecoveryCoordinator,
} from "./recovery";

// ---------------------------------------------------------------------------
// Plug-in points — the caller provides these. Keeps stream.ts testable
// without dragging in tRPC, Zustand, React, or any I/O.
// ---------------------------------------------------------------------------

export interface StreamSubscribeHandle {
	/** Unsubscribe + tear down. Idempotent. */
	unsubscribe(): void;
}

export interface StreamSubscribeOptions {
	/** Called for every event the server pushes (no filtering). */
	onData: (event: ChatStreamEvent) => void;
	/** Stream-level error (e.g. auth failure). */
	onError?: (error: unknown) => void;
	/** Connection closed (user-initiated or server-side). */
	onClose?: () => void;
}

export interface StreamSubscribe {
	(
		input: { sessionID: string },
		options: StreamSubscribeOptions,
	): StreamSubscribeHandle;
}

export interface SessionSnapshotResult {
	/** The sequence at which the snapshot was taken. */
	sequence: number;
	/** The snapshot event, ready to dispatch to the store. */
	event: Extract<ChatStreamEvent, { type: "session.snapshot" }>;
}

export interface StreamFetchSnapshot {
	(input: { sessionID: string }): Promise<SessionSnapshotResult>;
}

export interface StreamEventSink {
	/** Called for every classified "apply" event. */
	applyEvent: (event: ChatStreamEvent) => void;
}

// ---------------------------------------------------------------------------
// Options + handle
// ---------------------------------------------------------------------------

export interface StartStreamOptions {
	sessionID: string;
	subscribe: StreamSubscribe;
	fetchSnapshot: StreamFetchSnapshot;
	sink: StreamEventSink;
	/**
	 * Pre-constructed coordinator. When omitted a fresh one is created
	 * — most callers want the default.
	 */
	coordinator?: ChatRecoveryCoordinator;
	/** Optional dev observability hooks. */
	logger?: StreamLogger;
}

export interface StreamLogger {
	onBootstrapStart?: () => void;
	onBootstrapComplete?: (snapshotSequence: number) => void;
	onClassify?: (
		sequence: number,
		decision: "ignore" | "defer" | "recover" | "apply",
	) => void;
	onRecoveryStart?: (reason: "sequence-gap" | "replay-failed") => void;
	onRecoveryComplete?: (snapshotSequence: number) => void;
	onFlushDeferred?: (applied: number, stillDeferred: number) => void;
	onError?: (error: unknown, phase: string) => void;
	onClose?: () => void;
}

export interface StreamHandle {
	/** Stop the stream and release resources. Idempotent. */
	stop(): void;
	/** Current coordinator state — useful for dev overlays. */
	getState(): ReturnType<ChatRecoveryCoordinator["getState"]>;
}

// ---------------------------------------------------------------------------
// startStream — the single public entry point
// ---------------------------------------------------------------------------

export function startStream(options: StartStreamOptions): StreamHandle {
	const coordinator =
		options.coordinator ?? createChatRecoveryCoordinator();
	const log = options.logger ?? {};

	// Events buffered while a recovery phase is in flight OR because they
	// arrived with a gap the current snapshot doesn't close.
	let deferred: ChatStreamEvent[] = [];
	let subscribeHandle: StreamSubscribeHandle | null = null;
	let stopped = false;

	const teardown = () => {
		if (stopped) return;
		stopped = true;
		subscribeHandle?.unsubscribe();
		subscribeHandle = null;
		deferred = [];
		log.onClose?.();
	};

	const classifyAndHandle = (event: ChatStreamEvent): void => {
		if (stopped) return;
		const decision = coordinator.classifyEvent(event.sequence);
		log.onClassify?.(event.sequence, decision);
		switch (decision) {
			case "ignore":
				return;
			case "apply":
				options.sink.applyEvent(event);
				coordinator.markEventBatchApplied([event]);
				return;
			case "defer":
				deferred.push(event);
				return;
			case "recover":
				deferred.push(event);
				void triggerRecovery("sequence-gap");
				return;
		}
	};

	/**
	 * Apply as many buffered events as we can contiguously from
	 * latestSequence+1 onward. Events still on the wrong side of a gap
	 * stay buffered for the next recovery cycle.
	 *
	 * Intentionally does NOT re-enter recovery — that only happens from
	 * fresh subscription events via classifyAndHandle. Keeps the flow
	 * acyclic.
	 */
	const flushDeferred = (): void => {
		if (stopped) return;
		if (deferred.length === 0) return;
		const incoming = deferred;
		deferred = [];
		incoming.sort((a, b) => a.sequence - b.sequence);
		let applied = 0;
		for (const event of incoming) {
			if (stopped) return;
			const latest = coordinator.getState().latestSequence;
			if (event.sequence <= latest) continue; // covered by a later snapshot
			if (event.sequence !== latest + 1) {
				// Still gapped — leave buffered.
				deferred.push(event);
				continue;
			}
			options.sink.applyEvent(event);
			coordinator.markEventBatchApplied([event]);
			applied += 1;
		}
		log.onFlushDeferred?.(applied, deferred.length);
	};

	const bootstrap = async (): Promise<void> => {
		if (stopped) return;
		log.onBootstrapStart?.();
		if (!coordinator.beginSnapshotRecovery("bootstrap")) return;
		try {
			const { sequence, event } = await options.fetchSnapshot({
				sessionID: options.sessionID,
			});
			if (stopped) return;
			options.sink.applyEvent(event);
			coordinator.completeSnapshotRecovery(sequence);
			log.onBootstrapComplete?.(sequence);
			flushDeferred();
		} catch (error) {
			log.onError?.(error, "bootstrap");
			coordinator.failSnapshotRecovery();
		}
	};

	const triggerRecovery = async (
		reason: "sequence-gap" | "replay-failed",
	): Promise<void> => {
		if (stopped) return;
		log.onRecoveryStart?.(reason);
		if (!coordinator.beginSnapshotRecovery(reason)) return;
		try {
			const { sequence, event } = await options.fetchSnapshot({
				sessionID: options.sessionID,
			});
			if (stopped) return;
			options.sink.applyEvent(event);
			coordinator.completeSnapshotRecovery(sequence);
			log.onRecoveryComplete?.(sequence);
			flushDeferred();
		} catch (error) {
			log.onError?.(error, "recover");
			coordinator.failSnapshotRecovery();
		}
	};

	// Kick things off.
	void bootstrap();
	subscribeHandle = options.subscribe(
		{ sessionID: options.sessionID },
		{
			onData: (event) => {
				if (stopped) return;
				classifyAndHandle(event);
			},
			onError: (error) => log.onError?.(error, "subscribe"),
			onClose: () => {
				log.onClose?.();
				// Drop the buffer — a fresh stream will re-bootstrap.
				deferred = [];
			},
		},
	);

	return {
		stop: teardown,
		getState: () => coordinator.getState(),
	};
}

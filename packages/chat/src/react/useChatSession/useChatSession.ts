import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	SessionClient,
	SessionStream,
	StreamStatus,
	Wait,
} from "../../client";
import {
	DEFAULT_BACKOFF_INITIAL_MS,
	DEFAULT_BACKOFF_MAX_MS,
} from "../../client";
import type { OutboxEntry, SessionSnapshot } from "../../core";
import {
	emptySnapshot,
	hasOmittedBody,
	Outbox,
	reduceMany,
	snapshotFromOutline,
	withItemBodies,
} from "../../core";
import type { Cursor } from "../../protocol/cursor";
import type { DeltaChannel, Envelope } from "../../protocol/envelope";
import { isDurableEnvelope, isResetEnvelope } from "../../protocol/envelope";
import type { Decision, UserContent, UserMessage } from "../../protocol/items";

import { newerThan } from "./utils/newerThan";

export type FrameScheduler = (flush: () => void) => () => void;

const defaultScheduler: FrameScheduler = (flush) => {
	const scope = globalThis as {
		requestAnimationFrame?: (callback: () => void) => number;
		cancelAnimationFrame?: (handle: number) => void;
	};
	if (typeof scope.requestAnimationFrame === "function") {
		const frame = scope.requestAnimationFrame(() => flush());
		return () => scope.cancelAnimationFrame?.(frame);
	}
	const timer = setTimeout(flush, 16);
	return () => clearTimeout(timer);
};

const defaultWait: Wait = (callback, delayMs) => {
	const timer = setTimeout(callback, delayMs);
	return () => clearTimeout(timer);
};

const SEED_TIMEOUT_MS = 10_000;
const MAX_BODIES_PER_REQUEST = 100;
const MAX_BODY_ATTEMPTS = 3;

type Seed =
	| { kind: "outline"; snapshot: SessionSnapshot }
	| { kind: "page"; envelopes: Envelope[]; nextBefore: Cursor | null };

async function fetchSeed(
	client: SessionClient,
	pageSize: number | undefined,
	timed: <T>(request: Promise<T>) => Promise<T> = (request) => request,
): Promise<Seed | null> {
	try {
		const outline = await timed(client.getOutline());
		if (outline.ok) {
			return {
				kind: "outline",
				snapshot: snapshotFromOutline(outline.outline),
			};
		}
	} catch {}
	const page = await timed(client.getItems({ limit: pageSize }));
	if (!page.ok) return null;
	return {
		kind: "page",
		envelopes: page.envelopes,
		nextBefore: page.nextBefore,
	};
}

export const DEFAULT_DELTAS: readonly DeltaChannel[] = [
	"text",
	"tool_input",
	"terminal",
];

export type UseChatSessionOptions = {
	client: SessionClient;
	deltas?: readonly DeltaChannel[];
	pageSize?: number;
	scheduler?: FrameScheduler;
	wait?: Wait;
};

export type ChatSessionStatus = "loading" | "ready";

export type ChatSession = {
	snapshot: SessionSnapshot;
	status: ChatSessionStatus;
	connection: StreamStatus;
	unreachable: boolean;
	outbox: OutboxEntry[];
	hasOlder: boolean;
	requestItemBodies(itemIds: readonly string[]): void;
	sendPrompt(
		content: UserContent[],
		steer?: { expectedTurnId: string },
	): OutboxEntry;
	retryPrompt(clientId: string): void;
	discardPrompt(clientId: string): void;
	loadOlder(): Promise<boolean>;
	removeQueuedPrompt(itemId: string): Promise<void>;
	steerQueuedPrompt(itemId: string): Promise<void>;
	resumeQueue(): Promise<void>;
	cancelTurn(turnId: string, options?: { pauseQueue?: boolean }): Promise<void>;
	stopBackgroundTask(taskId: string): Promise<boolean>;
	respondToApproval(approvalId: string, decision: Decision): Promise<void>;
	setMode(modeId: string): Promise<void>;
	setConfigOption(configId: string, value: string): Promise<void>;
};

function confirmEchoes(outbox: Outbox, batch: readonly Envelope[]): void {
	for (const envelope of batch) {
		if (!isDurableEnvelope(envelope)) continue;
		if (envelope.event.type !== "item") continue;
		const item = envelope.event.item;
		if (item.kind !== "user_message") continue;
		const clientId = (item as UserMessage).clientId;
		if (clientId) outbox.confirm(clientId);
	}
}

export function useChatSession(options: UseChatSessionOptions): ChatSession {
	const client = options.client;
	const pageSize = options.pageSize;
	const deltasKey = (options.deltas ?? DEFAULT_DELTAS).join(",");

	const [snapshot, setSnapshot] = useState<SessionSnapshot>(emptySnapshot);
	const [status, setStatus] = useState<ChatSessionStatus>("loading");
	const [connection, setConnection] = useState<StreamStatus>("connecting");
	const [unreachable, setUnreachable] = useState(false);
	const [outboxEntries, setOutboxEntries] = useState<OutboxEntry[]>([]);
	const [hasOlder, setHasOlder] = useState(false);

	const schedulerRef = useRef(options.scheduler ?? defaultScheduler);
	schedulerRef.current = options.scheduler ?? defaultScheduler;
	const waitRef = useRef(options.wait ?? defaultWait);
	waitRef.current = options.wait ?? defaultWait;
	const connectedRef = useRef(false);

	const pendingRef = useRef<Envelope[]>([]);
	const cancelFlushRef = useRef<(() => void) | null>(null);
	const nextBeforeRef = useRef<Cursor | null>(null);
	const resyncingRef = useRef(false);
	const resyncAgainRef = useRef(false);
	const resyncBufferRef = useRef<Envelope[] | null>(null);
	const clientRef = useRef(client);
	clientRef.current = client;

	const outbox = useMemo(
		() =>
			new Outbox({
				send: async (entry) => {
					await client.prompt({
						commandId: entry.commandId,
						clientId: entry.clientId,
						content: entry.content,
						...(entry.steer ? { steer: entry.steer } : {}),
					});
				},
			}),
		[client],
	);

	useEffect(() => {
		setOutboxEntries(outbox.snapshot());
		return outbox.subscribe(() => setOutboxEntries(outbox.snapshot()));
	}, [outbox]);

	useEffect(() => {
		connectedRef.current = connection === "open";
		if (connectedRef.current) void outbox.flush();
	}, [connection, outbox]);

	const commit = useCallback(() => {
		cancelFlushRef.current = null;
		const batch = pendingRef.current;
		pendingRef.current = [];
		if (batch.length === 0) return;
		confirmEchoes(outbox, batch);
		resyncBufferRef.current?.push(...batch);
		setSnapshot((prev) => reduceMany(prev, batch));
	}, [outbox]);

	const enqueue = useCallback(
		(envelope: Envelope) => {
			pendingRef.current.push(envelope);
			if (!cancelFlushRef.current) {
				cancelFlushRef.current = schedulerRef.current(commit);
			}
		},
		[commit],
	);

	const requestedBodiesRef = useRef(new Set<string>());
	const bodyQueueRef = useRef<string[]>([]);
	const bodyFlushRef = useRef(false);
	const bodyAttemptsRef = useRef(new Map<string, number>());
	const seedGenerationRef = useRef(0);
	const requestItemBodiesRef = useRef<(itemIds: readonly string[]) => void>(
		() => {},
	);

	const requestItemBodies = useCallback(
		(itemIds: readonly string[]) => {
			for (const id of itemIds) {
				if (requestedBodiesRef.current.has(id)) continue;
				requestedBodiesRef.current.add(id);
				bodyQueueRef.current.push(id);
			}
			if (bodyFlushRef.current || bodyQueueRef.current.length === 0) return;
			bodyFlushRef.current = true;
			queueMicrotask(() => {
				bodyFlushRef.current = false;
				const queued = bodyQueueRef.current;
				bodyQueueRef.current = [];
				const generation = seedGenerationRef.current;
				const current = () =>
					clientRef.current === client &&
					seedGenerationRef.current === generation;
				for (let i = 0; i < queued.length; i += MAX_BODIES_PER_REQUEST) {
					const chunk = queued.slice(i, i + MAX_BODIES_PER_REQUEST);
					const retry = () => {
						if (!current()) return;
						const again: string[] = [];
						for (const id of chunk) {
							requestedBodiesRef.current.delete(id);
							const attempts = (bodyAttemptsRef.current.get(id) ?? 0) + 1;
							bodyAttemptsRef.current.set(id, attempts);
							if (attempts < MAX_BODY_ATTEMPTS) again.push(id);
						}
						if (again.length === 0) return;
						const attempt = bodyAttemptsRef.current.get(again[0] ?? "") ?? 1;
						waitRef.current(
							() => {
								if (current()) requestItemBodiesRef.current(again);
							},
							DEFAULT_BACKOFF_INITIAL_MS * 2 ** attempt,
						);
					};
					client.getItemBodies(chunk).then((result) => {
						if (!current()) return;
						if (!result.ok) return retry();
						setSnapshot((prev) => withItemBodies(prev, result.items));
					}, retry);
				}
			});
		},
		[client],
	);
	requestItemBodiesRef.current = requestItemBodies;

	const applySeed = useCallback(
		(seed: Seed, merge: boolean, arrived: readonly Envelope[] = []) => {
			const requested = requestedBodiesRef.current;
			requestedBodiesRef.current = new Set();
			bodyAttemptsRef.current = new Map();
			seedGenerationRef.current += 1;
			if (seed.kind === "outline") {
				nextBeforeRef.current = null;
				setHasOlder(false);
				const seeded = reduceMany(
					seed.snapshot,
					newerThan(seed.snapshot, arrived),
				);
				setSnapshot(seeded);
				const stillOmitted = [...requested].filter((id) => {
					const stored = seeded.items.get(id);
					return stored !== undefined && hasOmittedBody(stored.item);
				});
				if (stillOmitted.length > 0) {
					requestItemBodiesRef.current(stillOmitted);
				}
				return seeded;
			}
			nextBeforeRef.current = seed.nextBefore;
			setHasOlder(seed.nextBefore !== null);
			const apply = (prev: SessionSnapshot) =>
				reduceMany(
					{ ...prev, cursor: null, pendingReset: null },
					seed.envelopes,
				);
			if (merge) {
				setSnapshot(apply);
				return null;
			}
			const seeded = apply(emptySnapshot());
			setSnapshot(seeded);
			return seeded;
		},
		[],
	);

	const resync = useCallback(
		async (afterReset = false) => {
			if (resyncingRef.current) {
				if (afterReset) resyncAgainRef.current = true;
				return;
			}
			resyncingRef.current = true;
			try {
				do {
					resyncAgainRef.current = false;
					resyncBufferRef.current = [];
					const seed = await fetchSeed(client, pageSize).catch(() => null);
					if (clientRef.current !== client) return;
					const seeded = seed
						? applySeed(seed, true, resyncBufferRef.current)
						: null;
					if (seeded?.pendingReset) resyncAgainRef.current = true;
				} while (resyncAgainRef.current);
			} finally {
				resyncingRef.current = false;
				resyncBufferRef.current = null;
			}
		},
		[client, pageSize, applySeed],
	);

	useEffect(() => {
		if (snapshot.pendingReset) void resync();
	}, [snapshot.pendingReset, resync]);

	useEffect(() => {
		let cancelled = false;
		let stream: SessionStream | null = null;
		const deltas = deltasKey ? (deltasKey.split(",") as DeltaChannel[]) : [];

		setStatus("loading");
		setUnreachable(false);
		setConnection("connecting");
		setSnapshot(emptySnapshot());
		setHasOlder(false);
		nextBeforeRef.current = null;
		pendingRef.current = [];

		let cancelRetry: (() => void) | null = null;
		const retry = (attempt: number) => {
			const delayMs = Math.min(
				DEFAULT_BACKOFF_INITIAL_MS * 2 ** attempt,
				DEFAULT_BACKOFF_MAX_MS,
			);
			cancelRetry = waitRef.current(() => {
				cancelRetry = null;
				void seed(attempt + 1);
			}, delayMs);
		};

		const timed = <T>(request: Promise<T>) =>
			new Promise<T>((resolve, reject) => {
				const cancelTimeout = waitRef.current(
					() => reject(new Error("timed out")),
					SEED_TIMEOUT_MS,
				);
				request.then(
					(value) => {
						cancelTimeout();
						resolve(value);
					},
					(error: unknown) => {
						cancelTimeout();
						reject(error);
					},
				);
			});

		const seed = async (attempt: number) => {
			let session: Awaited<ReturnType<SessionClient["getSession"]>>;
			let seed: Seed | null;
			try {
				session = await timed(client.getSession());
				seed = await fetchSeed(client, pageSize, timed);
			} catch {
				if (cancelled) return;
				setUnreachable(true);
				retry(attempt);
				return;
			}
			setUnreachable(false);
			if (cancelled) return;
			let seeded: SessionSnapshot | null = null;
			if (seed) seeded = applySeed(seed, false);
			else setSnapshot(emptySnapshot());
			setStatus("ready");
			stream = client.subscribe({
				deltas,
				since: seeded?.cursor ?? session.cursor,
				onEnvelope: (envelope) => {
					if (!isResetEnvelope(envelope)) enqueue(envelope);
				},
				onReset: () => {
					void resync(true);
				},
				onStatusChange: setConnection,
			});
		};
		void seed(0);

		return () => {
			cancelled = true;
			seedGenerationRef.current += 1;
			cancelRetry?.();
			cancelFlushRef.current?.();
			cancelFlushRef.current = null;
			pendingRef.current = [];
			stream?.close();
		};
	}, [client, deltasKey, pageSize, enqueue, resync, applySeed]);

	const sendPrompt = useCallback(
		(content: UserContent[], steer?: { expectedTurnId: string }) => {
			const entry = outbox.enqueue(content, steer);
			if (connectedRef.current) void outbox.flush();
			return entry;
		},
		[outbox],
	);

	const retryPrompt = useCallback(
		(clientId: string) => {
			outbox.retry(clientId);
			if (connectedRef.current) void outbox.flush();
		},
		[outbox],
	);

	const discardPrompt = useCallback(
		(clientId: string) => {
			outbox.discard(clientId);
		},
		[outbox],
	);

	const loadOlder = useCallback(async () => {
		const before = nextBeforeRef.current;
		if (!before) return true;
		nextBeforeRef.current = null;
		const page = await client.getItems({ before, limit: pageSize });
		if (clientRef.current !== client) return true;
		if (!page.ok) {
			nextBeforeRef.current = before;
			return false;
		}
		nextBeforeRef.current = page.nextBefore;
		setHasOlder(page.nextBefore !== null);
		setSnapshot((prev) => {
			const older = reduceMany(emptySnapshot(), page.envelopes);
			return {
				...prev,
				turns: new Map([...older.turns, ...prev.turns]),
				items: new Map([...older.items, ...prev.items]),
			};
		});
		return true;
	}, [client, pageSize]);

	const removeQueuedPrompt = useCallback(
		(itemId: string) => client.removeQueuedPrompt(itemId),
		[client],
	);
	const steerQueuedPrompt = useCallback(
		(itemId: string) => client.steerQueuedPrompt(itemId),
		[client],
	);

	const resumeQueue = useCallback(() => client.resumeQueue(), [client]);

	const cancelTurn = useCallback(
		(turnId: string, options?: { pauseQueue?: boolean }) =>
			client.cancelTurn(turnId, options),
		[client],
	);
	const stopBackgroundTask = useCallback(
		(taskId: string) => client.stopBackgroundTask(taskId),
		[client],
	);
	const respondToApproval = useCallback(
		(approvalId: string, decision: Decision) =>
			client.respondToApproval(approvalId, decision),
		[client],
	);
	const setMode = useCallback(
		(modeId: string) => client.setMode(modeId),
		[client],
	);

	const setConfigOption = useCallback(
		(configId: string, value: string) =>
			client.setConfigOption(configId, value),
		[client],
	);

	return {
		snapshot,
		status,
		connection,
		unreachable,
		outbox: outboxEntries,
		hasOlder,
		requestItemBodies,
		sendPrompt,
		retryPrompt,
		discardPrompt,
		loadOlder,
		removeQueuedPrompt,
		steerQueuedPrompt,
		resumeQueue,
		cancelTurn,
		stopBackgroundTask,
		respondToApproval,
		setMode,
		setConfigOption,
	};
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionClient, SessionStream, StreamStatus } from "../../client";
import type { OutboxEntry, SessionSnapshot } from "../../core";
import { emptySnapshot, Outbox, reduceMany } from "../../core";
import type { Cursor } from "../../protocol/cursor";
import type { DeltaChannel, Envelope } from "../../protocol/envelope";
import { isDurableEnvelope } from "../../protocol/envelope";
import type { Decision, UserContent, UserMessage } from "../../protocol/items";

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
};

export type ChatSessionStatus = "loading" | "ready";

export type ChatSession = {
	snapshot: SessionSnapshot;
	status: ChatSessionStatus;
	connection: StreamStatus;
	outbox: OutboxEntry[];
	hasOlder: boolean;
	sendPrompt(content: UserContent[]): OutboxEntry;
	retryPrompt(clientId: string): void;
	discardPrompt(clientId: string): void;
	loadOlder(): Promise<void>;
	cancelTurn(turnId: string): Promise<void>;
	respondToApproval(approvalId: string, decision: Decision): Promise<void>;
	setMode(modeId: string): Promise<void>;
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
	const [outboxEntries, setOutboxEntries] = useState<OutboxEntry[]>([]);
	const [hasOlder, setHasOlder] = useState(false);

	const schedulerRef = useRef(options.scheduler ?? defaultScheduler);
	schedulerRef.current = options.scheduler ?? defaultScheduler;

	const pendingRef = useRef<Envelope[]>([]);
	const cancelFlushRef = useRef<(() => void) | null>(null);
	const nextBeforeRef = useRef<Cursor | null>(null);
	const resyncingRef = useRef(false);
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
					});
				},
			}),
		[client],
	);

	useEffect(() => {
		setOutboxEntries(outbox.snapshot());
		return outbox.subscribe(() => setOutboxEntries(outbox.snapshot()));
	}, [outbox]);

	const commit = useCallback(() => {
		cancelFlushRef.current = null;
		const batch = pendingRef.current;
		pendingRef.current = [];
		if (batch.length === 0) return;
		confirmEchoes(outbox, batch);
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

	const resync = useCallback(async () => {
		if (resyncingRef.current) return;
		resyncingRef.current = true;
		try {
			const page = await client.getItems({ limit: pageSize });
			if (clientRef.current !== client) return;
			if (!page.ok) return;
			nextBeforeRef.current = page.nextBefore;
			setHasOlder(page.nextBefore !== null);
			setSnapshot((prev) =>
				reduceMany(
					{ ...prev, cursor: null, pendingReset: null },
					page.envelopes,
				),
			);
		} finally {
			resyncingRef.current = false;
		}
	}, [client, pageSize]);

	useEffect(() => {
		if (snapshot.pendingReset) void resync();
	}, [snapshot.pendingReset, resync]);

	useEffect(() => {
		let cancelled = false;
		let stream: SessionStream | null = null;
		const deltas = deltasKey ? (deltasKey.split(",") as DeltaChannel[]) : [];

		setStatus("loading");
		setConnection("connecting");
		setSnapshot(emptySnapshot());
		setHasOlder(false);
		nextBeforeRef.current = null;
		pendingRef.current = [];

		const seed = async () => {
			const session = await client.getSession();
			const page = await client.getItems({ limit: pageSize });
			if (cancelled) return;
			let seeded = emptySnapshot();
			if (page.ok) {
				seeded = reduceMany(seeded, page.envelopes);
				nextBeforeRef.current = page.nextBefore;
				setHasOlder(page.nextBefore !== null);
			}
			setSnapshot(seeded);
			setStatus("ready");
			stream = client.subscribe({
				deltas,
				since: seeded.cursor ?? session.cursor,
				onEnvelope: enqueue,
				onReset: () => {
					void resync();
				},
				onStatusChange: setConnection,
			});
		};
		void seed();

		return () => {
			cancelled = true;
			cancelFlushRef.current?.();
			cancelFlushRef.current = null;
			pendingRef.current = [];
			stream?.close();
		};
	}, [client, deltasKey, pageSize, enqueue, resync]);

	const sendPrompt = useCallback(
		(content: UserContent[]) => {
			const entry = outbox.enqueue(content);
			void outbox.flush();
			return entry;
		},
		[outbox],
	);

	const retryPrompt = useCallback(
		(clientId: string) => {
			outbox.retry(clientId);
			void outbox.flush();
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
		if (!before) return;
		nextBeforeRef.current = null;
		const page = await client.getItems({ before, limit: pageSize });
		if (clientRef.current !== client) return;
		if (!page.ok) {
			nextBeforeRef.current = before;
			return;
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
	}, [client, pageSize]);

	const cancelTurn = useCallback(
		(turnId: string) => client.cancelTurn(turnId),
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

	return {
		snapshot,
		status,
		connection,
		outbox: outboxEntries,
		hasOlder,
		sendPrompt,
		retryPrompt,
		discardPrompt,
		loadOlder,
		cancelTurn,
		respondToApproval,
		setMode,
	};
}

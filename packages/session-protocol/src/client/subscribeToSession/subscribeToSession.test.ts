import { describe, expect, test } from "bun:test";
import type { SessionEventEnvelope } from "../../events";
import type { SDKMessage } from "../../sdk-types";
import { type StreamStatus, subscribeToSession } from "./subscribeToSession";

const SESSION_ID = "00000000-0000-4000-8000-000000000001";

class FakeWebSocket {
	url: string;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;
	closedByClient = false;

	constructor(url: string) {
		this.url = url;
	}

	close(): void {
		this.closedByClient = true;
	}

	open(): void {
		this.onopen?.();
	}

	message(envelope: SessionEventEnvelope): void {
		this.onmessage?.({ data: JSON.stringify(envelope) });
	}

	rawMessage(value: unknown): void {
		this.onmessage?.({
			data: typeof value === "string" ? value : JSON.stringify(value),
		});
	}

	serverClose(): void {
		this.onclose?.({ code: 1006 });
	}
}

function sdkStateMessage(seq: number): SDKMessage {
	return {
		type: "system",
		subtype: "session_state_changed",
		state: seq % 2 === 0 ? "idle" : "running",
		uuid: `message-${seq}`,
		session_id: "claude-1",
	};
}

function envelope(seq: number): SessionEventEnvelope {
	return {
		seq,
		sessionId: SESSION_ID,
		ts: seq,
		frame: { kind: "sdk", message: sdkStateMessage(seq) },
	};
}

function resetEnvelope(
	reason: string,
	latestSeq?: number,
): SessionEventEnvelope {
	return {
		seq: 0,
		sessionId: SESSION_ID,
		ts: 1,
		frame: { kind: "reset", reason, latestSeq },
	};
}

function harness(options?: {
	since?: number;
	streamUrl?: string | (() => string | Promise<string>);
}) {
	const sockets: FakeWebSocket[] = [];
	const delivered: SessionEventEnvelope[] = [];
	const statuses: StreamStatus[] = [];
	const gaps: Array<{ expected: number; received: number }> = [];
	const resets: Array<{ reason: string; latestSeq?: number }> = [];
	const invalid: string[] = [];
	const subscription = subscribeToSession({
		streamUrl: options?.streamUrl ?? "ws://test/stream",
		sessionId: SESSION_ID,
		since: options?.since,
		onEnvelope: (item) => delivered.push(item),
		onStatus: (status) => statuses.push(status),
		onGap: (gap) => gaps.push(gap),
		onReset: (reason, latestSeq) => resets.push({ reason, latestSeq }),
		onInvalidEnvelope: (reason) => invalid.push(reason),
		createWebSocket: (url) => {
			const socket = new FakeWebSocket(url);
			sockets.push(socket);
			return socket;
		},
		reconnectDelayMs: 1,
	});
	return {
		sockets,
		delivered,
		statuses,
		gaps,
		resets,
		invalid,
		subscription,
	};
}

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

describe("subscribeToSession", () => {
	test("appends a cursor, delivers in order, and deduplicates", () => {
		const h = harness({ since: 10 });
		expect(h.sockets[0]?.url).toBe("ws://test/stream?since=10");
		h.sockets[0]?.open();
		h.sockets[0]?.message(envelope(10));
		h.sockets[0]?.message(envelope(11));
		h.sockets[0]?.message(envelope(11));
		h.sockets[0]?.message(envelope(12));
		expect(h.delivered.map((item) => item.seq)).toEqual([11, 12]);
		expect(h.subscription.lastSeq).toBe(12);
		h.subscription.close();
	});

	test("replaces an existing since parameter without disturbing auth", () => {
		const h = harness({
			since: 3,
			streamUrl: "ws://test/stream?token=abc&since=1#tail",
		});
		expect(h.sockets[0]?.url).toBe("ws://test/stream?token=abc&since=3#tail");
		h.subscription.close();
	});

	test("without a cursor accepts the first live seq, then repairs a gap", async () => {
		const h = harness();
		h.sockets[0]?.open();
		h.sockets[0]?.message(envelope(41));
		h.sockets[0]?.message(envelope(43));
		expect(h.delivered.map((item) => item.seq)).toEqual([41]);
		expect(h.gaps).toEqual([{ expected: 42, received: 43 }]);
		await tick();
		expect(h.sockets[1]?.url).toBe("ws://test/stream?since=41");
		h.subscription.close();
	});

	test("reconnect resolves a fresh URL so expiring auth can refresh", async () => {
		let token = 0;
		const h = harness({
			since: 0,
			streamUrl: () => `ws://test/stream?token=${++token}`,
		});
		expect(h.sockets[0]?.url).toBe("ws://test/stream?token=1&since=0");
		h.sockets[0]?.open();
		h.sockets[0]?.message(envelope(1));
		h.sockets[0]?.serverClose();
		await tick();
		expect(h.sockets[1]?.url).toBe("ws://test/stream?token=2&since=1");
		h.subscription.close();
	});

	test("runtime-invalid JSON reconnects from the last good cursor", async () => {
		const h = harness({ since: 0 });
		h.sockets[0]?.open();
		h.sockets[0]?.message(envelope(1));
		h.sockets[0]?.rawMessage({
			seq: "2",
			sessionId: SESSION_ID,
			ts: 2,
			frame: { kind: "sdk", message: {} },
		});
		expect(h.invalid[0]).toContain("failed validation");
		await tick();
		expect(h.sockets[1]?.url).toBe("ws://test/stream?since=1");
		h.subscription.close();
	});

	test("a nominal seq-0 reset stops even when the cursor is in the future", async () => {
		const h = harness({ since: 999 });
		h.sockets[0]?.open();
		h.sockets[0]?.message(resetEnvelope("cursor_ahead", 4));
		expect(h.resets).toEqual([{ reason: "cursor_ahead", latestSeq: 4 }]);
		expect(h.statuses.at(-1)).toBe("stopped");
		await tick();
		expect(h.sockets).toHaveLength(1);
	});

	test("a first normal frame behind the requested cursor fails closed", () => {
		const h = harness({ since: 999 });
		h.sockets[0]?.open();
		h.sockets[0]?.message(envelope(4));
		expect(h.resets).toEqual([{ reason: "cursor_ahead", latestSeq: 4 }]);
		expect(h.delivered).toHaveLength(0);
	});

	test("user close prevents reconnect", async () => {
		const h = harness({ since: 0 });
		h.sockets[0]?.open();
		h.subscription.close();
		expect(h.sockets[0]?.closedByClient).toBe(true);
		await tick();
		expect(h.sockets).toHaveLength(1);
	});
});

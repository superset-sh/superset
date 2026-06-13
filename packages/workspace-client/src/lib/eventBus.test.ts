/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { getEventBus } from "./eventBus";

type CloseHandler = (event: { code?: number; reason?: string }) => void;

class MockWebSocket {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;

	static instances: MockWebSocket[] = [];

	readonly url: string;
	readyState = MockWebSocket.CONNECTING;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onclose: CloseHandler | null = null;
	onerror: (() => void) | null = null;

	constructor(url: string) {
		this.url = url;
		MockWebSocket.instances.push(this);
	}

	send() {}

	close(code = 1000, reason = "") {
		this.readyState = MockWebSocket.CLOSED;
		this.onclose?.({ code, reason });
	}
}

const originalWebSocket = globalThis.WebSocket;
const originalFetch = globalThis.fetch;

async function flushPromises(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

describe("eventBus", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		MockWebSocket.instances = [];
		globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
	});

	afterEach(() => {
		globalThis.WebSocket = originalWebSocket;
		globalThis.fetch = originalFetch;
		jest.useRealTimers();
	});

	test("does not open a websocket and slows reconnects when relay reports host unavailable", async () => {
		const fetchUrls: string[] = [];
		globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
			fetchUrls.push(String(input));
			return new Response(null, { status: 503 });
		}) as typeof fetch;

		const bus = getEventBus(
			"http://relay.test/hosts/org:offline-host",
			() => "fresh-token",
		);
		const removeListener = bus.on("terminal:lifecycle", "*", () => {});
		const release = bus.retain();

		await flushPromises();

		expect(fetchUrls).toHaveLength(1);
		expect(fetchUrls[0]).toContain("/hosts/org:offline-host/_whoowns");
		expect(MockWebSocket.instances).toHaveLength(0);

		jest.advanceTimersByTime(29_999);
		await flushPromises();

		expect(fetchUrls).toHaveLength(1);
		expect(MockWebSocket.instances).toHaveLength(0);

		jest.advanceTimersByTime(1);
		await flushPromises();

		expect(fetchUrls).toHaveLength(2);
		expect(MockWebSocket.instances).toHaveLength(0);

		removeListener();
		release();
	});
});

import {
	afterEach,
	beforeEach,
	describe,
	expect,
	jest,
	mock,
	test,
} from "bun:test";

const appStateListeners: ((state: string) => void)[] = [];
const appState = {
	currentState: "active",
	addEventListener: (_: string, listener: (state: string) => void) => {
		appStateListeners.push(listener);
		return {
			remove: () =>
				appStateListeners.splice(appStateListeners.indexOf(listener), 1),
		};
	},
};
mock.module("react-native", () => ({ AppState: appState }));
mock.module("@/lib/env", () => ({
	env: { EXPO_PUBLIC_REALTIME_URL: "http://localhost:3018" },
}));
const tokenRequests: (boolean | undefined)[] = [];
mock.module("@/lib/host/client", () => ({
	getHostAuthToken: async (options?: { forceRefresh?: boolean }) => {
		tokenRequests.push(options?.forceRefresh);
		return "jwt";
	},
}));

class FakeWebSocket {
	static all: FakeWebSocket[] = [];
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onclose: ((event: { code: number }) => void) | null = null;
	constructor(readonly url: string) {
		FakeWebSocket.all.push(this);
	}
	close() {}
}

const { openNudgeSocket } = await import("./nudgeSocket");

async function settle(ms = 0) {
	jest.advanceTimersByTime(ms);
	for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("openNudgeSocket", () => {
	let reopened = 0;
	let stop: () => void;

	beforeEach(async () => {
		jest.useFakeTimers();
		globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		FakeWebSocket.all = [];
		tokenRequests.length = 0;
		appState.currentState = "active";
		reopened = 0;
		stop = openNudgeSocket({
			organizationId: "org",
			onMessage: () => {},
			onReopen: () => reopened++,
		});
		await settle();
	});

	afterEach(() => {
		stop();
		jest.useRealTimers();
	});

	test("backs off and refreshes the token when the Worker refuses it", async () => {
		for (const [attempt, wait] of [1_000, 2_000, 4_000].entries()) {
			const socket = FakeWebSocket.all[attempt];
			socket?.onopen?.();
			socket?.onclose?.({ code: 4403 });
			await settle(wait - 1);
			expect(FakeWebSocket.all).toHaveLength(attempt + 1);
			await settle(1);
			expect(FakeWebSocket.all).toHaveLength(attempt + 2);
		}
		expect(tokenRequests.slice(1).every(Boolean)).toBe(true);
		expect(reopened).toBe(0);
	});

	test("refetches once a socket stays open after a failed dial", async () => {
		FakeWebSocket.all[0]?.onclose?.({ code: 1006 });
		await settle(1_000);
		FakeWebSocket.all[1]?.onopen?.();
		await settle(2_000);
		expect(reopened).toBe(1);
	});

	test("does not refetch on the first open or after a return from the background", async () => {
		FakeWebSocket.all[0]?.onopen?.();
		await settle(2_000);
		appState.currentState = "background";
		for (const listener of appStateListeners) listener("background");
		appState.currentState = "active";
		for (const listener of appStateListeners) listener("active");
		await settle();
		FakeWebSocket.all[1]?.onopen?.();
		await settle(2_000);
		expect(reopened).toBe(0);
	});

	test("gives up on a dial that never opens", async () => {
		await settle(15_000);
		await settle(1_000);
		expect(FakeWebSocket.all).toHaveLength(2);
	});
});

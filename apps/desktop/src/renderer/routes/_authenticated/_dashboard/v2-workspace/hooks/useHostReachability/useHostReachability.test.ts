import { afterAll, afterEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const NativeWebSocket = globalThis.WebSocket;
const NativeEvent = globalThis.Event;
const NativeMessageEvent = globalThis.MessageEvent;
const NativeEventTarget = globalThis.EventTarget;
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
globalThis.WebSocket = NativeWebSocket;
// partysocket may already be loaded by another suite and extends the native
// EventTarget. Its dynamically created events must stay in that same realm.
globalThis.Event = NativeEvent;
globalThis.MessageEvent = NativeMessageEvent;
globalThis.EventTarget = NativeEventTarget;
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { setHostServiceSecret, removeHostServiceSecret } = await import(
	"renderer/lib/host-service-auth"
);
const { useHostReachability } = await import("./useHostReachability");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

test("a slow handshake completes while the degraded notice is showing", async () => {
	let attempts = 0;
	const server = Bun.serve({
		port: 0,
		async fetch(request, instance) {
			attempts++;
			// Longer than the old gate's first forced retry (2s + 5s),
			// but within the relay's supported handshake budget.
			await Bun.sleep(8_000);
			if (instance.upgrade(request)) return;
			return new Response("Upgrade cancelled", { status: 400 });
		},
		websocket: { message() {} },
	});
	const hostUrl = `http://127.0.0.1:${server.port}`;
	setHostServiceSecret(hostUrl, "test-token");
	try {
		const { result, unmount } = renderHook(() => useHostReachability(hostUrl));
		let sawDegraded = false;
		const deadline = Date.now() + 10_000;
		while (!result.current.hasConnected && Date.now() < deadline) {
			// Flush each transition so the real grace timer and its effects
			// run during the handshake, rather than after a single long act.
			await act(async () => {
				await Bun.sleep(25);
			});
			sawDegraded ||= result.current.isDegraded;
		}
		expect(sawDegraded).toBe(true);
		expect(result.current.hasConnected).toBe(true);
		expect(result.current.isDegraded).toBe(false);
		expect(result.current.isUnreachable).toBe(false);
		expect(attempts).toBe(1);
		unmount();
	} finally {
		cleanup();
		removeHostServiceSecret(hostUrl);
		await server.stop(true);
	}
}, 20_000);

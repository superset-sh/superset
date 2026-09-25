import { expect, test } from "bun:test";
import { TunnelClient } from "./tunnel-client";

async function exerciseDial({
	delayMs,
	rejectFirst = false,
}: {
	delayMs: number;
	rejectFirst?: boolean;
}) {
	let attempts = 0;
	let requests = 0;
	let resultResolve: (value: string) => void = () => {};
	const result = new Promise<string>((resolve) => {
		resultResolve = resolve;
	});
	const local = Bun.serve({
		port: 0,
		fetch(request) {
			requests++;
			expect(request.headers.get("authorization")).toBe("Bearer test-secret");
			return new Response("proxied successfully");
		},
	});
	const relay = Bun.serve<{ control: boolean }>({
		port: 0,
		async fetch(request, server) {
			const control = new URL(request.url).pathname === "/v2/control";
			if (!control) {
				attempts++;
				if (rejectFirst && attempts === 1) {
					return new Response("temporary failure", { status: 503 });
				}
				await Bun.sleep(delayMs);
			}
			if (server.upgrade(request, { data: { control } })) return;
			return new Response("upgrade failed", { status: 400 });
		},
		websocket: {
			open(socket) {
				if (socket.data.control) {
					socket.send(
						JSON.stringify({
							type: "stream:dial",
							ticket: "test-ticket",
							kind: "http",
							path: "/health",
						}),
					);
				} else {
					socket.send(
						JSON.stringify({
							type: "http:request",
							method: "GET",
							path: "/health",
							headers: {},
						}),
					);
					socket.send(JSON.stringify({ type: "http:end" }));
				}
			},
			message(socket, data) {
				if (typeof data !== "string") return;
				const frame = JSON.parse(data);
				if (frame.type === "ping")
					socket.send(JSON.stringify({ type: "pong" }));
				if (frame.type === "stream:dial-failed") resultResolve("failed");
				if (frame.type === "http:response") expect(frame.status).toBe(200);
				if (frame.type === "http:end") resultResolve("success");
			},
		},
	});
	const client = new TunnelClient({
		relayUrl: `http://127.0.0.1:${relay.port}`,
		hostId: "org:host",
		getAuthToken: async () => "test-token",
		localPort: local.port ?? 0,
		hostServiceSecret: "test-secret",
	});
	const start = performance.now();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await client.connect();
		const outcome = await Promise.race([
			result,
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error("Dial did not settle")),
					40_000,
				);
			}),
		]);
		return {
			outcome,
			attempts,
			requests,
			elapsedMs: performance.now() - start,
		};
	} finally {
		clearTimeout(timer);
		client.close();
		relay.stop(true);
		local.stop(true);
	}
}

test("real sockets proxy HTTP after a 25-second opening handshake", async () => {
	const result = await exerciseDial({ delayMs: 25_000 });
	expect(result.outcome).toBe("success");
	expect(result.attempts).toBe(1);
	expect(result.requests).toBe(1);
	expect(result.elapsedMs).toBeGreaterThanOrEqual(25_000);
}, 45_000);

test("real sockets recover from a rejected upgrade and a slow retry", async () => {
	const result = await exerciseDial({ delayMs: 4_500, rejectFirst: true });
	expect(result.outcome).toBe("success");
	expect(result.attempts).toBe(2);
	expect(result.requests).toBe(1);
}, 45_000);

test("real sockets report a stalled upgrade without forwarding the request", async () => {
	const result = await exerciseDial({ delayMs: 35_000 });
	expect(result.outcome).toBe("failed");
	expect(result.attempts).toBe(1);
	expect(result.requests).toBe(0);
	expect(result.elapsedMs).toBeGreaterThanOrEqual(29_900);
	expect(result.elapsedMs).toBeLessThan(35_000);
}, 45_000);

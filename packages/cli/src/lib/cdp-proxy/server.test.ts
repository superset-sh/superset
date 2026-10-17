import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createServer, type Socket } from "node:net";
import { env } from "../env";
import { createHostTokenProvider } from "../host-target/exchangeApiKey";
import { startCdpProxy } from "./server";

const token = "a".repeat(64);
const stopToken = "b".repeat(64);
const originalApiUrl = env.SUPERSET_API_URL;
const cleanup: Array<() => void> = [];
afterEach(() => {
	for (const stop of cleanup.splice(0)) stop();
	env.SUPERSET_API_URL = originalApiUrl;
});

function echo() {
	const server = Bun.serve({
		port: 0,
		fetch(request, server) {
			if (server.upgrade(request)) return;
			return new Response(null, { status: 400 });
		},
		websocket: {
			message(ws, message) {
				ws.send(message);
			},
		},
	});
	cleanup.push(() => server.stop(true));
	return `${server.url.origin.replace("http", "ws")}/browser/pane/cdp?workspaceId=workspace`;
}

function proxy(overrides: Partial<Parameters<typeof startCdpProxy>[0]> = {}) {
	const service = startCdpProxy({
		id: "test",
		token,
		stopToken,
		upstreamUrl: echo(),
		getToken: async () => "upstream",
		...overrides,
	});
	cleanup.unshift(service.stop);
	return {
		...service,
		url: `${service.endpoint.replace("http", "ws")}/cdp?token=${token}`,
	};
}

function connect(url: string) {
	const ws = new WebSocket(url);
	cleanup.unshift(() => ws.close());
	return ws;
}

function exchange(url: string, message = "message") {
	const ws = connect(url);
	return new Promise<string>((resolve, reject) => {
		ws.onopen = () => ws.send(message);
		ws.onmessage = (event) => {
			resolve(String(event.data));
			ws.close();
		};
		ws.onerror = () => reject(new Error("WebSocket connection failed"));
	});
}

test("refreshes the cached upstream JWT on a later connection to the same URL", async () => {
	let clock = 1_000_000;
	const received: string[] = [];
	let exchanges = 0;
	const api = Bun.serve({
		port: 0,
		fetch() {
			exchanges++;
			return Response.json({
				token: `header.${Buffer.from(JSON.stringify({ exp: clock / 1000 + 3600 })).toString("base64url")}.signature`,
			});
		},
	});
	cleanup.push(() => api.stop(true));
	env.SUPERSET_API_URL = api.url.origin;
	const relay = Bun.serve({
		port: 0,
		fetch(request, server) {
			const url = new URL(request.url);
			const jwt = url.searchParams.get("token") ?? "";
			received.push(jwt);
			const payload = JSON.parse(
				Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString(),
			);
			if (payload.exp <= clock / 1000)
				return new Response(null, { status: 401 });
			expect(url.pathname).toBe("/browser/pane/cdp");
			expect(url.searchParams.get("workspaceId")).toBe("workspace");
			if (server.upgrade(request)) return;
			return new Response(null, { status: 400 });
		},
		websocket: {
			message(ws, message) {
				ws.send(message);
			},
		},
	});
	cleanup.push(() => relay.stop(true));
	const service = proxy({
		upstreamUrl: `${relay.url.origin.replace("http", "ws")}/browser/pane/cdp?workspaceId=workspace`,
		getToken: createHostTokenProvider(
			["sk", "test", "fixture"].join("_"),
			() => clock,
		),
	});
	expect(await exchange(service.url)).toBe("message");
	clock += 3_601_000;
	expect(
		await exchange(`${service.url}&workspaceId=another&upstreamUrl=elsewhere`),
	).toBe("message");
	expect(exchanges).toBe(2);
	expect(received[0]).not.toBe(received[1]);
});

test("rejects wrong capabilities, browser origins and foreign Host headers", async () => {
	const service = proxy();
	expect((await fetch(`${service.endpoint}/cdp?token=wrong`)).status).toBe(401);
	expect(
		(
			await fetch(service.url.replace("ws", "http"), {
				headers: { Origin: "https://example.com" },
			})
		).status,
	).toBe(403);
	expect(
		(
			await fetch(service.url.replace("ws", "http"), {
				headers: { Host: "example.com" },
			})
		).status,
	).toBe(403);
	expect(
		(
			await fetch(`${service.endpoint}/stop`, {
				method: "POST",
				headers: { Authorization: `Bearer ${token}` },
			})
		).status,
	).toBe(401);
	expect(
		(
			await fetch(`${service.endpoint}/health`, {
				headers: { Authorization: `Bearer ${stopToken}` },
			})
		).status,
	).toBe(200);
	expect(
		(
			await fetch(`${service.endpoint}/stop`, {
				method: "POST",
				headers: { Authorization: `Bearer ${stopToken}` },
			})
		).status,
	).toBe(200);
	await service.closed;
	await expect(fetch(`${service.endpoint}/health`)).rejects.toThrow();
});

test("redacts failed upstream authentication and closes the client", async () => {
	const api = Bun.serve({
		port: 0,
		fetch: () => new Response("private key details", { status: 401 }),
	});
	cleanup.push(() => api.stop(true));
	env.SUPERSET_API_URL = api.url.origin;
	const service = proxy({
		getToken: createHostTokenProvider(
			["sk", "test", "rejected", "fixture"].join("_"),
		),
	});
	const ws = connect(service.url);
	const event = await new Promise<CloseEvent>((resolve) => {
		ws.onclose = resolve;
	});
	expect(event.code).toBe(1011);
	expect(event.reason).toBe("CDP authentication failed");
});

test.each([
	"client",
	"upstream",
])("propagates %s closure without illegal close codes", async (side) => {
	let ready: () => void = () => {};
	let ended: () => void = () => {};
	const opened = new Promise<void>((resolve) => {
		ready = resolve;
	});
	const upstreamClosed = new Promise<void>((resolve) => {
		ended = resolve;
	});
	const upstream = Bun.serve({
		port: 0,
		fetch(request, server) {
			if (server.upgrade(request)) return;
			return new Response(null, { status: 400 });
		},
		websocket: {
			open() {
				ready();
			},
			message(ws) {
				ws.terminate();
			},
			close() {
				ended();
			},
		},
	});
	cleanup.push(() => upstream.stop(true));
	const service = proxy({
		upstreamUrl: upstream.url.origin.replace("http", "ws"),
	});
	const ws = connect(service.url);
	const closed = new Promise<CloseEvent>((resolve) => {
		ws.onclose = resolve;
	});
	await opened;
	if (side === "client") ws.close();
	else ws.send("close");
	expect((await closed).code).toBe(1000);
	await upstreamClosed;
});

test("bounds frames queued while obtaining a token and ignores late completion", async () => {
	let release: (value: string) => void = () => {};
	const service = proxy({
		getToken: () =>
			new Promise((resolve) => {
				release = resolve;
			}),
		maxPendingBytes: 8,
	});
	const ws = connect(service.url);
	const closed = new Promise<CloseEvent>((resolve) => {
		ws.onclose = resolve;
	});
	ws.onopen = () => {
		ws.send("12345");
		ws.send("67890");
	};
	expect((await closed).code).toBe(1009);
	release("upstream");
});

test("does not apply the preconnect queue limit to a connected large CDP frame", async () => {
	const service = proxy({ maxPendingBytes: 8 });
	const ws = connect(service.url);
	const result = await new Promise<string>((resolve) => {
		ws.onopen = () => ws.send("ready");
		ws.onmessage = (event) => {
			if (event.data === "ready") ws.send("x".repeat(4 * 1024 * 1024 + 1));
			else resolve(String(event.data));
		};
	});
	expect(result.length).toBe(4 * 1024 * 1024 + 1);
});

test("idle cleanup waits for active clients to disconnect", async () => {
	const service = proxy({ idleTimeoutMs: 30 });
	const ws = connect(service.url);
	await new Promise<void>((resolve) => {
		ws.onopen = () => resolve();
	});
	await Bun.sleep(40);
	expect(
		(
			await fetch(`${service.endpoint}/health`, {
				headers: { Authorization: `Bearer ${stopToken}` },
			})
		).status,
	).toBe(200);
	ws.close();
	await service.closed;
	await expect(fetch(`${service.endpoint}/health`)).rejects.toThrow();
});

test("a connection timeout releases the idle lifetime", async () => {
	const service = proxy({
		getToken: () => new Promise(() => {}),
		connectTimeoutMs: 10,
		idleTimeoutMs: 10,
	});
	const ws = connect(service.url);
	const closed = await new Promise<CloseEvent>((resolve) => {
		ws.onclose = resolve;
	});
	expect(closed.code).toBe(1011);
	await service.closed;
});

test("stopping terminates an upstream that never acknowledges WebSocket close", async () => {
	let upstream: Socket | undefined;
	let accepted: () => void = () => {};
	const connected = new Promise<void>((resolve) => {
		accepted = resolve;
	});
	const tcp = createServer((socket) => {
		upstream = socket;
		socket.once("data", (data) => {
			const key =
				data.toString().match(/Sec-WebSocket-Key: (.+)\r\n/i)?.[1] ?? "";
			const accept = createHash("sha1")
				.update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
				.digest("base64");
			socket.write(
				`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
			);
			accepted();
		});
	});
	await new Promise<void>((resolve) => tcp.listen(0, "127.0.0.1", resolve));
	try {
		const address = tcp.address();
		if (!address || typeof address === "string")
			throw new Error("Missing TCP address");
		const service = proxy({
			upstreamUrl: `ws://127.0.0.1:${address.port}/cdp`,
		});
		connect(service.url);
		await connected;
		const closed = new Promise<boolean>((resolve) =>
			upstream!.once("close", () => resolve(true)),
		);
		service.stop();
		expect(await Promise.race([closed, Bun.sleep(250).then(() => false)])).toBe(
			true,
		);
	} finally {
		upstream?.destroy();
		tcp.close();
	}
});

import assert from "node:assert/strict";
import net from "node:net";
import { after, before, test } from "node:test";
import { type ServerType, serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import type { DetectedPort } from "@superset/port-scanner";
import { Hono } from "hono";
import { registerTcpForwardRoute } from "./tcp-forward-route.ts";

const WORKSPACE_ID = "ws-owner";
let httpServer: ServerType;
let httpPort = 0;
let echoServer: net.Server;
let echoPort = 0;
let closedEchoPort = 0;
const echoSockets = new Set<net.Socket>();

function ownedPort(port: number): DetectedPort {
	return {
		port,
		pid: 1,
		processName: "echo",
		terminalId: "t1",
		workspaceId: WORKSPACE_ID,
		detectedAt: 0,
		address: "127.0.0.1",
	};
}

before(async () => {
	echoServer = net.createServer((socket) => {
		echoSockets.add(socket);
		socket.on("close", () => echoSockets.delete(socket));
		socket.pipe(socket);
	});
	echoPort = await new Promise<number>((resolve) => {
		echoServer.listen(0, "127.0.0.1", () => {
			resolve((echoServer.address() as net.AddressInfo).port);
		});
	});
	// A port the scanner attributes to the workspace but nothing listens on.
	const probe = net.createServer();
	closedEchoPort = await new Promise<number>((resolve) => {
		probe.listen(0, "127.0.0.1", () => {
			const { port } = probe.address() as net.AddressInfo;
			probe.close(() => resolve(port));
		});
	});

	const app = new Hono();
	const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
	registerTcpForwardRoute({
		app,
		upgradeWebSocket,
		getPortsByWorkspace: (workspaceId) =>
			workspaceId === WORKSPACE_ID
				? [ownedPort(echoPort), ownedPort(closedEchoPort)]
				: [],
	});
	httpPort = await new Promise<number>((resolve) => {
		httpServer = serve(
			{ fetch: app.fetch, port: 0, hostname: "127.0.0.1" },
			(info) => resolve(info.port),
		);
	});
	injectWebSocket(httpServer);
});

after(async () => {
	for (const s of echoSockets) s.destroy();
	await new Promise<void>((r) => echoServer.close(() => r()));
	await new Promise<void>((r) => httpServer.close(() => r()));
});

function dial(port: number, query = `workspaceId=${WORKSPACE_ID}`): WebSocket {
	const ws = new WebSocket(`ws://127.0.0.1:${httpPort}/tcp/${port}?${query}`);
	ws.binaryType = "arraybuffer";
	return ws;
}

function waitClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
	return new Promise((resolve) => {
		ws.addEventListener("close", (event) =>
			resolve({ code: event.code, reason: event.reason }),
		);
	});
}

function waitOpen(ws: WebSocket): Promise<void> {
	return new Promise((resolve, reject) => {
		ws.addEventListener("open", () => resolve(), { once: true });
		ws.addEventListener("error", () => reject(new Error("ws error")), {
			once: true,
		});
	});
}

function collect(ws: WebSocket, minBytes: number): Promise<string> {
	const chunks: Buffer[] = [];
	return new Promise((resolve) => {
		ws.addEventListener("message", (event) => {
			chunks.push(Buffer.from(event.data as ArrayBuffer));
			const all = Buffer.concat(chunks);
			if (all.byteLength >= minBytes) resolve(all.toString());
		});
	});
}

test("bytes echo both ways through the bridge", async () => {
	const ws = dial(echoPort);
	await waitOpen(ws);
	const got = collect(ws, 6);
	ws.send(Buffer.from("hello "));
	assert.equal(await got, "hello ");
	ws.close(1000);
	await waitClose(ws);
});

test("frames sent before the upstream connects are delivered", async () => {
	const ws = dial(echoPort);
	// Send immediately on open, before the host's net.connect has completed.
	const opened = waitOpen(ws);
	await opened;
	const got = collect(ws, 4);
	ws.send(Buffer.from("ab"));
	ws.send(Buffer.from("cd"));
	assert.equal(await got, "abcd");
	ws.close(1000);
	await waitClose(ws);
});

test("a port the workspace does not own closes with 1008", async () => {
	const ws = dial(echoPort, "workspaceId=someone-else");
	const closed = await waitClose(ws);
	assert.equal(closed.code, 1008);
	assert.equal(closed.reason, "port not owned by workspace");
});

test("a missing workspaceId closes with 1008", async () => {
	const ws = dial(echoPort, "");
	const closed = await waitClose(ws);
	assert.equal(closed.code, 1008);
	assert.equal(closed.reason, "workspaceId is required");
});

test("an owned port with no listener closes with 1011", async () => {
	const ws = dial(closedEchoPort);
	const closed = await waitClose(ws);
	assert.equal(closed.code, 1011);
	assert.match(closed.reason, /upstream connect failed: ECONNREFUSED/);
});

test("text frames close with 1003", async () => {
	const ws = dial(echoPort);
	await waitOpen(ws);
	ws.send("nope");
	const closed = await waitClose(ws);
	assert.equal(closed.code, 1003);
});

test("closing the WebSocket destroys the upstream TCP socket", async () => {
	const ws = dial(echoPort);
	await waitOpen(ws);
	const got = collect(ws, 1);
	ws.send(Buffer.from("x"));
	await got;
	assert.equal(echoSockets.size, 1);
	ws.close(1000);
	await waitClose(ws);
	await new Promise((r) => setTimeout(r, 50));
	assert.equal(echoSockets.size, 0);
});

test("closing the upstream TCP socket closes the WebSocket", async () => {
	const ws = dial(echoPort);
	await waitOpen(ws);
	const got = collect(ws, 1);
	ws.send(Buffer.from("x"));
	await got;
	for (const s of echoSockets) s.destroy();
	const closed = await waitClose(ws);
	assert.equal(closed.code, 1000);
});

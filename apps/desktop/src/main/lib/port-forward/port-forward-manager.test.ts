import { describe, expect, test } from "bun:test";
import net from "node:net";
import { type Duplex, PassThrough } from "node:stream";
import type { DetectedPort } from "@superset/port-scanner";
import type { ForwardTarget } from "shared/types";
import { PortForwardManager } from "./port-forward-manager";
import type { ForwardTransport } from "./types";

const HOST = "https://relay.test/hosts/org:machine";

async function startEcho(): Promise<{ port: number; close: () => void }> {
	const server = net.createServer((s) => s.pipe(s));
	const port = await new Promise<number>((resolve) =>
		server.listen(0, "127.0.0.1", () =>
			resolve((server.address() as net.AddressInfo).port),
		),
	);
	return { port, close: () => server.close() };
}

async function freePort(): Promise<number> {
	const server = net.createServer();
	return new Promise((resolve) =>
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address() as net.AddressInfo;
			server.close(() => resolve(port));
		}),
	);
}

/** A transport that opens a TCP connection to an echo server on this machine. */
function echoTransport(echoPort: number): ForwardTransport & {
	opened: ForwardTarget[];
} {
	const opened: ForwardTarget[] = [];
	return {
		kind: "relay",
		opened,
		probe: async () => {},
		openStream: async (target) => {
			opened.push(target);
			const socket = net.connect({ host: "127.0.0.1", port: echoPort });
			await new Promise<void>((r) => socket.once("connect", () => r()));
			return socket as Duplex;
		},
	};
}

function manager(
	transport: ForwardTransport,
	overrides: Partial<ConstructorParameters<typeof PortForwardManager>[0]> = {},
) {
	return new PortForwardManager({
		transport,
		getLocalPorts: () => [],
		killLocalPort: async () => ({ success: true }),
		canBindPort: async () => true,
		...overrides,
	});
}

async function roundTrip(port: number, payload: string): Promise<string> {
	const socket = net.connect({ host: "127.0.0.1", port });
	await new Promise<void>((r) => socket.once("connect", () => r()));
	socket.write(payload);
	// TCP may split the echo across chunks; collect until it is all here.
	const expected = Buffer.byteLength(payload);
	const data = await new Promise<Buffer>((resolve) => {
		const chunks: Buffer[] = [];
		let total = 0;
		socket.on("data", (chunk: Buffer) => {
			chunks.push(chunk);
			total += chunk.byteLength;
			if (total >= expected) resolve(Buffer.concat(chunks));
		});
	});
	socket.destroy();
	return data.toString();
}

describe("PortForwardManager", () => {
	test("sync listens on the requested port and bridges bytes", async () => {
		const echo = await startEcho();
		const transport = echoTransport(echo.port);
		const m = manager(transport);
		const local = await freePort();
		const [fwd] = await m.sync({
			clientId: "w1",
			hostUrl: HOST,
			workspaceId: "ws1",
			ports: [local],
		});
		expect(fwd?.status).toEqual({ state: "active", localPort: local });
		expect(await roundTrip(local, "ping")).toBe("ping");
		expect(transport.opened[0]).toEqual({
			hostUrl: HOST,
			workspaceId: "ws1",
			remotePort: local,
		});
		m.stopAll();
		echo.close();
	});

	test("sync for another workspace stops the previous forwards", async () => {
		const echo = await startEcho();
		const m = manager(echoTransport(echo.port));
		const a = await freePort();
		await m.sync({
			clientId: "w1",
			hostUrl: HOST,
			workspaceId: "ws1",
			ports: [a],
		});
		const b = await freePort();
		const list = await m.sync({
			clientId: "w1",
			hostUrl: HOST,
			workspaceId: "ws2",
			ports: [b],
		});
		expect(list.map((f) => f.target.workspaceId)).toEqual(["ws2"]);
		expect(await freeToBind(a)).toBe(true);
		m.stopAll();
		echo.close();
	});

	test("a busy local port reports busy with the owner when known", async () => {
		const echo = await startEcho();
		const owner: DetectedPort = {
			port: echo.port,
			pid: 42,
			processName: "node",
			terminalId: "t1",
			workspaceId: "local-ws",
			detectedAt: 0,
			address: "127.0.0.1",
		};
		const m = manager(echoTransport(echo.port), {
			getLocalPorts: () => [owner],
		});
		const [fwd] = await m.sync({
			clientId: "w1",
			hostUrl: HOST,
			workspaceId: "ws1",
			ports: [echo.port],
		});
		expect(fwd?.status).toEqual({
			state: "busy",
			localPort: echo.port,
			localOwner: {
				pid: 42,
				processName: "node",
				terminalId: "t1",
				workspaceId: "local-ws",
			},
		});
		m.stopAll();
		echo.close();
	});

	test("retryEphemeral moves a busy forward to another local port", async () => {
		const echo = await startEcho();
		const m = manager(echoTransport(echo.port));
		const [fwd] = await m.sync({
			clientId: "w1",
			hostUrl: HOST,
			workspaceId: "ws1",
			ports: [echo.port],
		});
		expect(fwd?.status.state).toBe("busy");
		const retried = await m.retryEphemeral(fwd?.id ?? "");
		expect(retried?.status.state).toBe("active");
		if (retried?.status.state !== "active") throw new Error("not active");
		expect(retried.status.localPort).not.toBe(echo.port);
		expect(await roundTrip(retried.status.localPort, "x")).toBe("x");
		m.stopAll();
		echo.close();
	});

	test("killLocalOwner restarts the forward once the port frees", async () => {
		const echo = await startEcho();
		let killed = false;
		const m = manager(echoTransport(echo.port), {
			getLocalPorts: () => [
				{
					port: echo.port,
					pid: 1,
					processName: "node",
					terminalId: "t1",
					workspaceId: "local-ws",
					detectedAt: 0,
					address: "127.0.0.1",
				},
			],
			killLocalPort: async () => {
				killed = true;
				echo.close();
				return { success: true };
			},
			canBindPort: freeToBind,
		});
		const [fwd] = await m.sync({
			clientId: "w1",
			hostUrl: HOST,
			workspaceId: "ws1",
			ports: [echo.port],
		});
		const result = await m.killLocalOwner(fwd?.id ?? "");
		expect(killed).toBe(true);
		expect(result).toEqual({ success: true });
		expect(m.list()[0]?.status).toEqual({
			state: "active",
			localPort: echo.port,
		});
		m.stopAll();
	});

	test("a failed probe yields an error status", async () => {
		const m = manager({
			kind: "relay",
			probe: async () => {
				throw new Error("probe failed");
			},
			openStream: async () => new PassThrough(),
		});
		const [fwd] = await m.sync({
			clientId: "w1",
			hostUrl: HOST,
			workspaceId: "ws1",
			ports: [await freePort()],
		});
		expect(fwd?.status).toEqual({ state: "error", message: "probe failed" });
		m.stopAll();
	});

	test("stopAll releases every listener", async () => {
		const echo = await startEcho();
		const m = manager(echoTransport(echo.port));
		const local = await freePort();
		await m.sync({
			clientId: "w1",
			hostUrl: HOST,
			workspaceId: "ws1",
			ports: [local],
		});
		m.stopAll();
		expect(m.list()).toEqual([]);
		expect(await freeToBind(local)).toBe(true);
		echo.close();
	});

	test("a sync during the probe never orphans a listener", async () => {
		const local = await freePort();
		let releaseProbe: () => void = () => {};
		const transport: ForwardTransport = {
			kind: "relay",
			probe: () =>
				new Promise<void>((resolve) => {
					releaseProbe = resolve;
				}),
			openStream: async () => new PassThrough() as unknown as Duplex,
		};
		const m = manager(transport);
		const first = m.sync({
			clientId: "w1",
			hostUrl: HOST,
			workspaceId: "ws1",
			ports: [local],
		});
		// Deselect before the probe answers.
		await m.sync({ clientId: "w1", hostUrl: HOST, workspaceId: "", ports: [] });
		releaseProbe();
		await first;
		expect(m.list()).toEqual([]);
		expect(await freeToBind(local)).toBe(true);
	});

	test("a later successful stream restores active after a failure", async () => {
		const echo = await startEcho();
		let fail = true;
		const echoing = echoTransport(echo.port);
		const transport: ForwardTransport = {
			kind: "relay",
			probe: async () => {},
			openStream: (target) => {
				if (fail) return Promise.reject(new Error("relay hiccup"));
				return echoing.openStream(target);
			},
		};
		const m = manager(transport);
		const local = await freePort();
		await m.sync({
			clientId: "w1",
			hostUrl: HOST,
			workspaceId: "ws1",
			ports: [local],
		});
		// The first connection fails and poisons the status.
		const s = net.connect({ host: "127.0.0.1", port: local });
		await new Promise((r) => s.once("close", r));
		expect(m.list()[0]?.status.state).toBe("error");
		// The listener is still bound; the next connection heals it.
		fail = false;
		expect(await roundTrip(local, "healed")).toBe("healed");
		expect(m.list()[0]?.status).toEqual({
			state: "active",
			localPort: local,
		});
		m.stopAll();
		echo.close();
	});

	test("two clients wanting different forwards do not fight", async () => {
		const echo = await startEcho();
		const m = manager(echoTransport(echo.port));
		const a = await freePort();
		const b = await freePort();
		await m.sync({
			clientId: "w1",
			hostUrl: HOST,
			workspaceId: "ws1",
			ports: [a],
		});
		await m.sync({
			clientId: "w2",
			hostUrl: HOST,
			workspaceId: "ws2",
			ports: [b],
		});
		// Both forwards run; neither sync tore the other down.
		expect(
			m
				.list()
				.map((f) => f.target.remotePort)
				.sort(),
		).toEqual([a, b].sort());
		// Releasing one client stops only its forward.
		await m.releaseClient("w1");
		expect(m.list().map((f) => f.target.remotePort)).toEqual([b]);
		expect(await freeToBind(a)).toBe(true);
		m.stopAll();
		echo.close();
	});

	test("a forward both clients want survives either releasing it", async () => {
		const echo = await startEcho();
		const m = manager(echoTransport(echo.port));
		const a = await freePort();
		await m.sync({
			clientId: "w1",
			hostUrl: HOST,
			workspaceId: "ws1",
			ports: [a],
		});
		await m.sync({
			clientId: "w2",
			hostUrl: HOST,
			workspaceId: "ws1",
			ports: [a],
		});
		await m.releaseClient("w1");
		expect(m.list()).toHaveLength(1);
		expect(await roundTrip(a, "still here")).toBe("still here");
		m.stopAll();
		echo.close();
	});
});

function freeToBind(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const server = net.createServer();
		server.once("error", () => resolve(false));
		server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
	});
}

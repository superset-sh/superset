import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import {
	type ClientMessage,
	CURRENT_PROTOCOL_VERSION,
	encodeFrame,
	FrameDecoder,
} from "@superset/pty-daemon/protocol";
import {
	disposeDaemonClient,
	getDaemonClient,
	onDaemonDisconnect,
	onDaemonPlannedRotation,
} from "./daemon-client-singleton.ts";
import { beginDaemonUpdate } from "./daemon-mutation-gate.ts";
import {
	__makeDaemonPtyForTesting,
	__sendDirectDaemonInputForTesting,
} from "./terminal.ts";

interface FakeDaemon {
	socketPath: string;
	connections: net.Socket[];
	received: ClientMessage["type"][];
	receivedByConnection: ClientMessage["type"][][];
	close(): Promise<void>;
}

async function startFakeDaemon(
	options: {
		dropFirstActivateConnection?: boolean;
		daemonVersions?: string[];
		initialReplay?: Buffer;
		appendReplayOnDroppedActivate?: Buffer;
	} = {},
): Promise<FakeDaemon> {
	const socketPath = path.join(
		os.tmpdir(),
		`host-singleflight-${process.pid}-${Math.random().toString(36).slice(2)}.sock`,
	);
	const connections: net.Socket[] = [];
	const received: ClientMessage["type"][] = [];
	const receivedByConnection: ClientMessage["type"][][] = [];
	let dropNextActivate = options.dropFirstActivateConnection ?? false;
	let replay = Buffer.from(options.initialReplay ?? Buffer.alloc(0));
	let listReplyOrdinal = 0;
	const server = net.createServer((socket) => {
		const connectionIndex = connections.length;
		connections.push(socket);
		const connectionMessages: ClientMessage["type"][] = [];
		receivedByConnection.push(connectionMessages);
		const decoder = new FrameDecoder();
		socket.on("data", (chunk) => {
			decoder.push(chunk);
			for (const frame of decoder.drain()) {
				const message = frame.message as ClientMessage;
				received.push(message.type);
				connectionMessages.push(message.type);
				if (message.type === "hello") {
					socket.write(
						encodeFrame({
							type: "hello-ack",
							protocol: CURRENT_PROTOCOL_VERSION,
							daemonVersion:
								options.daemonVersions?.[connectionIndex] ??
								"singleflight-test",
							daemonPid: process.pid,
						}),
					);
				} else if (message.type === "list") {
					listReplyOrdinal += 1;
					socket.write(
						encodeFrame({
							type: "list-reply",
							sessions: [
								{
									id: "known-session",
									pid: process.pid,
									cols: 80,
									rows: 24,
									alive: true,
								},
								{
									id: `list-reply-${listReplyOrdinal}`,
									pid: process.pid,
									cols: 80,
									rows: 24,
									alive: true,
								},
							],
						}),
					);
				} else if (message.type === "subscribe") {
					const replayBytes = message.replay ? replay.byteLength : 0;
					if (replayBytes > 0) {
						socket.write(
							encodeFrame({ type: "output", id: message.id }, replay),
						);
					}
					socket.write(
						encodeFrame({
							type: "subscribed",
							id: message.id,
							replayBytes,
							replayStartBytes: 0,
							replayEndBytes: replay.byteLength,
						}),
					);
				} else if (message.type === "activate-adopted") {
					if (dropNextActivate) {
						dropNextActivate = false;
						replay = Buffer.concat([
							replay,
							options.appendReplayOnDroppedActivate ?? Buffer.alloc(0),
						]);
						socket.destroy();
						continue;
					}
					socket.write(encodeFrame({ type: "adopted-activated", count: 0 }));
				}
			}
		});
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(socketPath, () => {
			server.off("error", reject);
			resolve();
		});
	});
	return {
		socketPath,
		connections,
		received,
		receivedByConnection,
		async close() {
			for (const socket of connections) socket.destroy();
			await new Promise<void>((resolve) => server.close(() => resolve()));
			try {
				fs.unlinkSync(socketPath);
			} catch {
				// Node normally removes Unix socket paths on close.
			}
		},
	};
}

const originalSocketOverride = process.env.SUPERSET_PTY_DAEMON_SOCKET;
const originalOrganizationId = process.env.ORGANIZATION_ID;

afterEach(async () => {
	await disposeDaemonClient();
	if (originalSocketOverride === undefined) {
		delete process.env.SUPERSET_PTY_DAEMON_SOCKET;
	} else {
		process.env.SUPERSET_PTY_DAEMON_SOCKET = originalSocketOverride;
	}
	if (originalOrganizationId === undefined) {
		delete process.env.ORGANIZATION_ID;
	} else {
		process.env.ORGANIZATION_ID = originalOrganizationId;
	}
});

describe.serial("daemon client singleton", () => {
	test("publishes one connection attempt before the socket-path await", async () => {
		const daemon = await startFakeDaemon();
		process.env.SUPERSET_PTY_DAEMON_SOCKET = daemon.socketPath;
		process.env.ORGANIZATION_ID = "singleflight-org";
		try {
			const [first, second, third] = await Promise.all([
				getDaemonClient(),
				getDaemonClient(),
				getDaemonClient(),
			]);
			expect(second).toBe(first);
			expect(third).toBe(first);
			expect(daemon.connections).toHaveLength(1);
		} finally {
			await disposeDaemonClient();
			await daemon.close();
		}
	});

	test("serializes parallel same-socket list barriers so each owns its reply", async () => {
		const daemon = await startFakeDaemon();
		process.env.SUPERSET_PTY_DAEMON_SOCKET = daemon.socketPath;
		process.env.ORGANIZATION_ID = "parallel-list-barrier-org";
		try {
			const client = await getDaemonClient();
			const [first, second] = await Promise.all([client.list(), client.list()]);
			expect(first.some(({ id }) => id === "list-reply-1")).toBe(true);
			expect(first.some(({ id }) => id === "list-reply-2")).toBe(false);
			expect(second.some(({ id }) => id === "list-reply-2")).toBe(true);
			expect(daemon.receivedByConnection[0]).toEqual(["hello", "list", "list"]);
		} finally {
			await disposeDaemonClient();
			await daemon.close();
		}
	});

	test("fails update visibly when fire-and-forget input loses its barrier socket", async () => {
		const daemon = await startFakeDaemon();
		process.env.SUPERSET_PTY_DAEMON_SOCKET = daemon.socketPath;
		process.env.ORGANIZATION_ID = "lost-input-barrier-org";
		let pty: ReturnType<typeof __makeDaemonPtyForTesting> | null = null;
		try {
			const client = await getDaemonClient();
			pty = __makeDaemonPtyForTesting(client, "known-session");
			await pty.write("unacknowledged-input");
			daemon.connections[0]?.destroy();
			for (let attempt = 0; attempt < 50 && client.isConnected; attempt++) {
				await new Promise((resolve) => setTimeout(resolve, 2));
			}
			expect(client.isConnected).toBe(false);

			const lease = beginDaemonUpdate("lost-input-barrier-org");
			await expect(lease.waitUntilDrained()).rejects.toThrow(
				/ownership is ambiguous/,
			);
			await lease.release("abort");
		} finally {
			pty?.disposeSubscriptions();
			await disposeDaemonClient();
			await daemon.close();
		}
	});

	test("fails closed when direct initial-command input loses its barrier socket", async () => {
		const daemon = await startFakeDaemon();
		process.env.SUPERSET_PTY_DAEMON_SOCKET = daemon.socketPath;
		process.env.ORGANIZATION_ID = "lost-initial-command-barrier-org";
		try {
			const client = await getDaemonClient();
			__sendDirectDaemonInputForTesting(
				client,
				"known-session",
				Buffer.from("initial-command\n"),
			);
			daemon.connections[0]?.destroy();
			for (let attempt = 0; attempt < 50 && client.isConnected; attempt++) {
				await new Promise((resolve) => setTimeout(resolve, 2));
			}
			expect(client.isConnected).toBe(false);

			const lease = beginDaemonUpdate("lost-initial-command-barrier-org");
			await expect(lease.waitUntilDrained()).rejects.toThrow(
				/ownership is ambiguous/,
			);
			await lease.release("abort");
			expect(daemon.received).not.toContain("prepare-upgrade");
		} finally {
			await disposeDaemonClient();
			await daemon.close();
		}
	});

	test("a replacement socket cannot overwrite an older unresolved input marker", async () => {
		const daemon = await startFakeDaemon();
		process.env.SUPERSET_PTY_DAEMON_SOCKET = daemon.socketPath;
		process.env.ORGANIZATION_ID = "sticky-input-barrier-org";
		try {
			const predecessor = await getDaemonClient();
			__sendDirectDaemonInputForTesting(
				predecessor,
				"known-session",
				Buffer.from("predecessor-input"),
			);
			daemon.connections[0]?.destroy();
			for (
				let attempt = 0;
				attempt < 50 && predecessor.isConnected;
				attempt++
			) {
				await new Promise((resolve) => setTimeout(resolve, 2));
			}

			const replacement = await getDaemonClient();
			expect(replacement).not.toBe(predecessor);
			__sendDirectDaemonInputForTesting(
				replacement,
				"known-session",
				Buffer.from("replacement-input"),
			);
			const lease = beginDaemonUpdate("sticky-input-barrier-org");
			await expect(lease.waitUntilDrained()).rejects.toThrow(
				/ownership is ambiguous/,
			);
			await lease.release("abort");
			expect(daemon.receivedByConnection[1]).not.toContain("list");
		} finally {
			await disposeDaemonClient();
			await daemon.close();
		}
	});

	test("planned predecessor close never emits generic disconnect teardown", async () => {
		const daemon = await startFakeDaemon({
			daemonVersions: ["0.2.5", "0.2.6"],
		});
		process.env.SUPERSET_PTY_DAEMON_SOCKET = daemon.socketPath;
		process.env.ORGANIZATION_ID = "planned-rotation-org";
		let disconnectNotifications = 0;
		const offDisconnect = onDaemonDisconnect(() => {
			disconnectNotifications += 1;
		});
		const offRotation = onDaemonPlannedRotation((client) => {
			client.subscribe(
				"known-session",
				{ replay: false },
				{ onOutput: () => {}, onExit: () => {} },
			);
			return {
				validate: () => {},
				commit: () => {},
				discard: () => {},
			};
		});
		try {
			const predecessor = await getDaemonClient();
			expect(predecessor.version).toBe("0.2.5");
			const lease = beginDaemonUpdate("planned-rotation-org");
			await lease.waitUntilDrained();

			daemon.connections[0]?.destroy();
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(disconnectNotifications).toBe(0);

			await lease.release("success");
			const successor = await getDaemonClient();
			expect(successor).not.toBe(predecessor);
			expect(successor.version).toBe("0.2.6");
			expect(daemon.connections).toHaveLength(2);
			expect(daemon.receivedByConnection[0]).toEqual(["hello", "list"]);
			expect(daemon.receivedByConnection[1]).toEqual([
				"hello",
				"subscribe",
				"activate-adopted",
			]);
			expect(disconnectNotifications).toBe(0);
		} finally {
			offRotation();
			offDisconnect();
			await disposeDaemonClient();
			await daemon.close();
		}
	});

	test("planned rotation retries an unacknowledged release and delivers the socket-gap bytes exactly once", async () => {
		const predecessorCut = Buffer.from([0x11, 0x00, 0xff, 0x22]);
		const betweenSockets = Buffer.from([0x00, 0xfe, 0x33, 0x33, 0x7f]);
		const daemon = await startFakeDaemon({
			dropFirstActivateConnection: true,
			initialReplay: predecessorCut,
			appendReplayOnDroppedActivate: betweenSockets,
		});
		process.env.SUPERSET_PTY_DAEMON_SOCKET = daemon.socketPath;
		process.env.ORGANIZATION_ID = "planned-rotation-retry-org";
		let disconnectNotifications = 0;
		let rebinds = 0;
		const observed: Buffer[] = [];
		const offDisconnect = onDaemonDisconnect(() => {
			disconnectNotifications += 1;
		});
		let pty: ReturnType<typeof __makeDaemonPtyForTesting> | null = null;
		const offRotation = onDaemonPlannedRotation(async (client) => {
			rebinds += 1;
			if (!pty) throw new Error("test PTY was not initialized");
			return pty.stageDaemonRebind(client);
		});
		try {
			const predecessor = await getDaemonClient();
			pty = __makeDaemonPtyForTesting(predecessor, "known-session");
			pty.subscribe(
				{ replay: false },
				{
					onOutput: (chunk) => observed.push(Buffer.from(chunk)),
					onExit: () => {},
				},
			);
			const lease = beginDaemonUpdate("planned-rotation-retry-org");
			await lease.waitUntilDrained();

			daemon.connections[0]?.destroy();
			await lease.release("success");

			expect(daemon.connections).toHaveLength(3);
			expect(daemon.received.slice(-8)).toEqual([
				"hello",
				"subscribe",
				"list",
				"activate-adopted",
				"hello",
				"subscribe",
				"list",
				"activate-adopted",
			]);
			expect(rebinds).toBe(2);
			expect(disconnectNotifications).toBe(0);
			expect(Buffer.concat(observed)).toEqual(betweenSockets);
		} finally {
			pty?.disposeSubscriptions();
			offRotation();
			offDisconnect();
			await disposeDaemonClient();
			await daemon.close();
		}
	});
});

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
					socket.write(encodeFrame({ type: "list-reply", sessions: [] }));
				} else if (message.type === "activate-adopted") {
					if (dropNextActivate) {
						dropNextActivate = false;
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

	test("planned rotation reconnects, rebinds, and retries an unacknowledged adopted release", async () => {
		const daemon = await startFakeDaemon({
			dropFirstActivateConnection: true,
		});
		process.env.SUPERSET_PTY_DAEMON_SOCKET = daemon.socketPath;
		process.env.ORGANIZATION_ID = "planned-rotation-retry-org";
		const offRotation = onDaemonPlannedRotation((client) => {
			client.subscribe(
				"known-session",
				{ replay: false },
				{ onOutput: () => {}, onExit: () => {} },
			);
		});
		try {
			await getDaemonClient();
			const lease = beginDaemonUpdate("planned-rotation-retry-org");
			await lease.waitUntilDrained();

			daemon.connections[0]?.destroy();
			await lease.release("success");

			expect(daemon.connections).toHaveLength(3);
			expect(daemon.received.slice(-6)).toEqual([
				"hello",
				"subscribe",
				"activate-adopted",
				"hello",
				"subscribe",
				"activate-adopted",
			]);
		} finally {
			offRotation();
			await disposeDaemonClient();
			await daemon.close();
		}
	});
});

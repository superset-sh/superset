import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import {
	type ClientMessage,
	encodeFrame,
	FrameDecoder,
} from "@superset/pty-daemon/protocol";
import {
	disposeDaemonClient,
	getDaemonClient,
	onDaemonDisconnect,
} from "./daemon-client-singleton.ts";
import { beginDaemonUpdate } from "./daemon-mutation-gate.ts";

interface FakeDaemon {
	socketPath: string;
	connections: net.Socket[];
	close(): Promise<void>;
}

async function startFakeDaemon(): Promise<FakeDaemon> {
	const socketPath = path.join(
		os.tmpdir(),
		`host-singleflight-${process.pid}-${Math.random().toString(36).slice(2)}.sock`,
	);
	const connections: net.Socket[] = [];
	const server = net.createServer((socket) => {
		connections.push(socket);
		const decoder = new FrameDecoder();
		socket.on("data", (chunk) => {
			decoder.push(chunk);
			for (const frame of decoder.drain()) {
				const message = frame.message as ClientMessage;
				if (message.type === "hello") {
					socket.write(
						encodeFrame({
							type: "hello-ack",
							protocol: 1,
							daemonVersion: "singleflight-test",
							daemonPid: process.pid,
						}),
					);
				} else if (message.type === "list") {
					socket.write(encodeFrame({ type: "list-reply", sessions: [] }));
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
		const daemon = await startFakeDaemon();
		process.env.SUPERSET_PTY_DAEMON_SOCKET = daemon.socketPath;
		process.env.ORGANIZATION_ID = "planned-rotation-org";
		let disconnectNotifications = 0;
		const offDisconnect = onDaemonDisconnect(() => {
			disconnectNotifications += 1;
		});
		try {
			const predecessor = await getDaemonClient();
			const lease = beginDaemonUpdate("planned-rotation-org");
			await lease.waitUntilDrained();

			daemon.connections[0]?.destroy();
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(disconnectNotifications).toBe(0);

			await lease.release("success");
			const successor = await getDaemonClient();
			expect(successor).not.toBe(predecessor);
			expect(daemon.connections).toHaveLength(2);
			expect(disconnectNotifications).toBe(0);
		} finally {
			offDisconnect();
			await disposeDaemonClient();
			await daemon.close();
		}
	});
});

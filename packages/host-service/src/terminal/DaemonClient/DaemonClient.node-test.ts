// End-to-end test for DaemonClient against a real pty-daemon Server.
// Runs under Node (`node --experimental-strip-types --test`) because the
// daemon spawns real PTYs via node-pty.

import { strict as assert } from "node:assert";
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Server } from "@superset/pty-daemon";
import {
	type ClientMessage,
	CORRELATED_INPUT_ACK_CAPABILITY,
	CURRENT_PROTOCOL_VERSION,
	encodeFrame,
	FrameDecoder,
} from "@superset/pty-daemon/protocol";
import { __createDaemonMutationGateForTesting } from "../daemon-mutation-gate.ts";
import { DaemonClient } from "./DaemonClient.ts";

const sockPath = path.join(
	os.tmpdir(),
	`host-daemon-client-${process.pid}.sock`,
);
let server: Server;
const DAEMON_SCRIPT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../../pty-daemon/src/main.ts",
);

before(async () => {
	server = new Server({
		socketPath: sockPath,
		daemonVersion: "0.2.7",
	});
	await server.listen();
});

after(async () => {
	await server.close();
});

test("connect + handshake exposes daemon version", async () => {
	const c = new DaemonClient({ socketPath: sockPath });
	await c.connect();
	assert.equal(c.version, "0.2.7");
	assert.equal(c.protocol, CURRENT_PROTOCOL_VERSION);
	assert.ok(c.isConnected);
	await c.dispose();
});

test("activateAdopted waits for the daemon release acknowledgement", async () => {
	const c = new DaemonClient({ socketPath: sockPath });
	await c.connect();
	assert.equal(await c.activateAdopted(), 0);
	await c.dispose();
});

test("open + subscribe + receive output + close", async () => {
	const c = new DaemonClient({ socketPath: sockPath });
	await c.connect();

	const id = "host-test-0";
	const result = await c.open(id, {
		shell: "/bin/sh",
		argv: ["-c", "echo from-daemon-client; sleep 0.2"],
		cols: 80,
		rows: 24,
	});
	assert.ok(result.pid > 0);

	const chunks: Buffer[] = [];
	const exitInfo: { code: number | null; signal: number | null }[] = [];
	const unsubscribe = c.subscribe(
		id,
		{ replay: true },
		{
			onOutput: (b) => chunks.push(b),
			onExit: (info) => exitInfo.push(info),
		},
	);

	await new Promise((r) => setTimeout(r, 600));
	const combined = Buffer.concat(chunks).toString("utf8");
	assert.ok(
		combined.includes("from-daemon-client"),
		`output missing marker: ${combined}`,
	);
	assert.equal(exitInfo.length, 1);
	assert.equal(exitInfo[0]?.code, 0);

	unsubscribe();
	await c.dispose();
});

test("subscribe replay boundary reports exact bytes after output callbacks", async () => {
	const c = new DaemonClient({ socketPath: sockPath });
	await c.connect();

	const id = "host-test-replay-boundary";
	const marker = "replay-boundary-marker";
	await c.open(id, {
		shell: "/bin/sh",
		argv: ["-c", `printf '${marker}'; sleep 10`],
		cols: 80,
		rows: 24,
	});

	try {
		// Observe the live marker first so the replay snapshot is guaranteed to
		// contain it. Unsubscribing does not clear the daemon's ring buffer.
		const liveChunks: Buffer[] = [];
		const stopLive = c.subscribe(
			id,
			{ replay: false },
			{ onOutput: (chunk) => liveChunks.push(chunk), onExit: () => {} },
		);
		await waitFor(
			() => Buffer.concat(liveChunks).toString().includes(marker),
			3000,
		);
		stopLive();

		const events: string[] = [];
		const replayChunks: Buffer[] = [];
		const { unsubscribe, boundary } = c.subscribeWithReplayBoundary(
			id,
			{ replay: true },
			{
				onOutput: (chunk) => {
					replayChunks.push(chunk);
					events.push("output");
				},
				onExit: () => {},
			},
		);

		const result = await boundary.then((value) => {
			events.push("boundary");
			return value;
		});
		unsubscribe();

		const replay = Buffer.concat(replayChunks);
		assert.ok(replay.toString().includes(marker));
		assert.equal(result.replayBytes, replay.byteLength);
		assert.equal(
			result.replayEndBytes,
			(result.replayStartBytes ?? 0) + replay.byteLength,
		);
		assert.ok(
			events.indexOf("output") >= 0 &&
				events.indexOf("output") < events.indexOf("boundary"),
			`expected output before boundary, got ${events.join(" -> ")}`,
		);
	} finally {
		await c.close(id, "SIGTERM").catch(() => {});
		await c.dispose();
	}
});

test("subscribe replay boundary reports zero for an empty ring", async () => {
	const c = new DaemonClient({ socketPath: sockPath });
	await c.connect();

	const id = "host-test-empty-replay-boundary";
	await c.open(id, {
		shell: "/bin/cat",
		argv: [],
		cols: 80,
		rows: 24,
	});

	try {
		const chunks: Buffer[] = [];
		const { unsubscribe, boundary } = c.subscribeWithReplayBoundary(
			id,
			{ replay: true },
			{ onOutput: (chunk) => chunks.push(chunk), onExit: () => {} },
		);
		const result = await boundary;
		unsubscribe();

		assert.equal(result.replayBytes, 0);
		assert.equal(result.replayStartBytes, result.replayEndBytes);
		assert.equal(Buffer.concat(chunks).byteLength, 0);
	} finally {
		await c.close(id, "SIGTERM").catch(() => {});
		await c.dispose();
	}
});

test("subscribe replay boundary rejects a matching ENOENT error", async () => {
	const c = new DaemonClient({ socketPath: sockPath });
	await c.connect();

	const id = "host-test-missing-replay-boundary";
	const { unsubscribe, boundary } = c.subscribeWithReplayBoundary(
		id,
		{ replay: true },
		{ onOutput: () => {}, onExit: () => {} },
	);

	try {
		await assert.rejects(boundary, /ENOENT|unknown session/);
	} finally {
		unsubscribe();
		await c.dispose();
	}
});

test("subscribe replay boundary survives an ordered exit after the subscribed ACK", async () => {
	const localPath = path.join(
		os.tmpdir(),
		`host-daemon-client-exit-boundary-${process.pid}-${Math.random().toString(36).slice(2)}.sock`,
	);
	const sessionId = "exit-after-subscribed-boundary";
	const local = net.createServer((socket) => {
		const decoder = new FrameDecoder();
		socket.on("data", (chunk) => {
			decoder.push(chunk);
			for (const frame of decoder.drain()) {
				const message = frame.message as ClientMessage;
				if (message.type === "hello") {
					socket.write(
						encodeFrame({
							type: "hello-ack",
							protocol: CURRENT_PROTOCOL_VERSION,
							daemonVersion: "0.2.7",
							daemonPid: process.pid,
						}),
					);
					continue;
				}
				if (message.type === "subscribe" && message.id === sessionId) {
					socket.write(
						Buffer.concat([
							encodeFrame({
								type: "subscribed",
								id: sessionId,
								replayBytes: 0,
								replayStartBytes: 12,
								replayEndBytes: 12,
							}),
							encodeFrame({
								type: "exit",
								id: sessionId,
								code: 0,
								signal: 0,
							}),
						]),
					);
					continue;
				}
				if (message.type === "list") {
					socket.write(encodeFrame({ type: "list-reply", sessions: [] }));
				}
			}
		});
	});
	await new Promise<void>((resolve, reject) => {
		local.once("error", reject);
		local.listen(localPath, () => {
			local.off("error", reject);
			resolve();
		});
	});

	const client = new DaemonClient({ socketPath: localPath });
	const exits: Array<{ code: number | null; signal: number | null }> = [];
	try {
		await client.connect();
		const { unsubscribe, boundary } = client.subscribeWithReplayBoundary(
			sessionId,
			{ replay: true },
			{ onOutput: () => {}, onExit: (info) => exits.push(info) },
		);
		assert.deepEqual(await boundary, {
			replayBytes: 0,
			replayStartBytes: 12,
			replayEndBytes: 12,
		});
		assert.deepEqual(exits, [{ code: 0, signal: 0 }]);
		unsubscribe();
	} finally {
		await client.dispose();
		await new Promise<void>((resolve) => local.close(() => resolve()));
	}
});

test("subscribe replay boundary rejects a session that exited during adoption", async () => {
	const c = new DaemonClient({ socketPath: sockPath });
	await c.connect();

	const id = "host-test-exited-replay-boundary";
	await c.open(id, {
		shell: "/bin/sh",
		argv: ["-c", "exit 0"],
		cols: 80,
		rows: 24,
	});
	await waitFor(
		async () => !(await c.list()).some((s) => s.id === id && s.alive),
		3000,
	);

	const { unsubscribe, boundary } = c.subscribeWithReplayBoundary(
		id,
		{ replay: true },
		{ onOutput: () => {}, onExit: () => {} },
	);
	try {
		await assert.rejects(boundary, /ENOENT|EEXITED|unknown session|exited/);
	} finally {
		unsubscribe();
		await c.dispose();
	}
});

test("legacy replay boundary ignores an older concurrent list reply", async () => {
	const localPath = path.join(
		os.tmpdir(),
		`host-daemon-client-legacy-${process.pid}-${Date.now()}.sock`,
	);
	const id = "legacy-replay-boundary";
	const marker = Buffer.from("legacy-replay-marker");
	const wireEvents: string[] = [];
	let listRequests = 0;
	const activeSockets = new Set<net.Socket>();
	let resolveFirstList: (() => void) | null = null;
	const firstListSeen = new Promise<void>((resolve) => {
		resolveFirstList = resolve;
	});
	let resolveSecondList: (() => void) | null = null;
	const secondListSeen = new Promise<void>((resolve) => {
		resolveSecondList = resolve;
	});

	const legacyServer = net.createServer((socket) => {
		activeSockets.add(socket);
		socket.once("close", () => activeSockets.delete(socket));
		const decoder = new FrameDecoder();
		socket.on("data", (chunk) => {
			decoder.push(chunk);
			for (const frame of decoder.drain()) {
				const message = frame.message as ClientMessage;
				if (message.type === "hello") {
					socket.write(
						encodeFrame({
							type: "hello-ack",
							protocol: CURRENT_PROTOCOL_VERSION,
							daemonVersion: "0.2.5",
							daemonPid: process.pid,
						}),
					);
					continue;
				}
				if (message.type === "list") {
					listRequests += 1;
					wireEvents.push(`list-${listRequests}`);
					if (listRequests === 1) resolveFirstList?.();
					if (listRequests === 2) resolveSecondList?.();
					continue;
				}
				if (message.type === "subscribe" && message.id === id) {
					wireEvents.push("subscribe");
					socket.write(encodeFrame(legacyListReply(id)));
				}
			}
		});
	});
	await listenUnixServer(legacyServer, localPath);

	const c = new DaemonClient({ socketPath: localPath });
	try {
		await c.connect();
		const olderList = c.list();
		await firstListSeen;
		const events: string[] = [];
		const chunks: Buffer[] = [];
		const { unsubscribe, boundary } = c.subscribeWithReplayBoundary(
			id,
			{ replay: true },
			{
				onOutput: (chunk) => {
					chunks.push(chunk);
					events.push("output");
				},
				onExit: () => {},
			},
		);
		let boundarySettled = false;
		void boundary.then(
			() => {
				boundarySettled = true;
			},
			() => {
				boundarySettled = true;
			},
		);

		await olderList;
		await secondListSeen;
		await new Promise<void>((resolve) => setImmediate(resolve));
		assert.equal(boundarySettled, false);
		assert.deepEqual(wireEvents, ["list-1", "subscribe", "list-2"]);

		const socket = [...activeSockets][0];
		assert.ok(socket);
		socket.write(encodeFrame({ type: "output", id }, marker));
		socket.write(encodeFrame(legacyListReply(id)));

		const result = await boundary.then((value) => {
			events.push("boundary");
			return value;
		});
		unsubscribe();

		assert.equal(result.replayBytes, null);
		assert.equal(Buffer.concat(chunks).toString(), marker.toString());
		assert.deepEqual(events, ["output", "boundary"]);
	} finally {
		await c.dispose();
		await closeServer(legacyServer);
	}
});

test("input is forwarded; resize updates dims", async () => {
	const c = new DaemonClient({ socketPath: sockPath });
	await c.connect();

	const id = "host-test-1";
	await c.open(id, {
		shell: "/bin/sh",
		argv: ["-i"],
		cols: 80,
		rows: 24,
	});

	const chunks: Buffer[] = [];
	const unsubscribe = c.subscribe(
		id,
		{ replay: false },
		{
			onOutput: (b) => chunks.push(b),
			onExit: () => {},
		},
	);

	await c.input(id, Buffer.from("echo input-marker\n"));

	await waitFor(
		() => Buffer.concat(chunks).toString().includes("input-marker"),
		3000,
	);

	c.resize(id, 100, 30);
	const list = await c.list();
	const me = list.find((s) => s.id === id);
	assert.equal(me?.cols, 100);
	assert.equal(me?.rows, 30);

	unsubscribe();
	await c.close(id, "SIGTERM");
	await c.dispose();
});

test("held adopted-PTY input above 8 MiB settles every correlated promise", async () => {
	const nonce = `${process.pid}-${Date.now()}`;
	const localSocket = path.join(
		os.tmpdir(),
		`host-daemon-input-backpressure-${nonce}.sock`,
	);
	const sessionId = `host-adopted-input-backpressure-${nonce}`;
	const predecessorProcess = spawnDaemonProcess(localSocket);
	let predecessor: DaemonClient | null = null;
	let successor: DaemonClient | null = null;
	let successorPid: number | null = null;
	let sessionPid: number | null = null;

	try {
		await waitFor(() => fs.existsSync(localSocket), 3_000);
		predecessor = await connectEventually(localSocket);
		const opened = await predecessor.open(sessionId, {
			shell: process.execPath,
			argv: [
				"--input-type=module",
				"--eval",
				[
					"process.stdin.setRawMode?.(true);",
					"process.stdin.pause();",
					"process.stdout.write('non-reader-ready\\n');",
					"setInterval(() => {}, 1000);",
				].join("\n"),
			],
			cols: 80,
			rows: 24,
		});
		sessionPid = opened.pid;
		const output: Buffer[] = [];
		const unsubscribe = predecessor.subscribe(
			sessionId,
			{ replay: false },
			{ onOutput: (chunk) => output.push(chunk), onExit: () => {} },
		);
		await waitFor(
			() => Buffer.concat(output).includes(Buffer.from("non-reader-ready")),
			3_000,
		);
		unsubscribe();

		const upgrade = await predecessor.prepareUpgrade();
		assert.equal(upgrade.ok, true, JSON.stringify(upgrade));
		if (!upgrade.ok) return;
		successorPid = upgrade.successorPid;
		await waitFor(() => predecessorProcess.exitCode !== null, 5_000);
		successor = await connectEventually(localSocket);
		assert.equal(
			successor.hasCapability(CORRELATED_INPUT_ACK_CAPABILITY),
			true,
		);
		await successor.activateAdopted();

		process.kill(sessionPid, "SIGSTOP");
		const chunkBytes = 2 * 1024 * 1024;
		const chunkCount = 6;
		assert.ok(chunkBytes < 8 * 1024 * 1024, "each frame must stay below cap");
		const gate = __createDaemonMutationGateForTesting(
			`host-input-backpressure-${nonce}`,
			{ maxOperations: chunkCount, maxBytes: 16 * 1024 * 1024 },
		);
		const lease = gate.beginUpdate();
		const writes = Array.from({ length: chunkCount }, (_, index) => {
			const payload = Buffer.alloc(chunkBytes, index + 1);
			return gate.run({ kind: "input", byteCost: payload.byteLength }, () => {
				if (!successor) throw new Error("successor disconnected");
				return successor.input(sessionId, payload);
			});
		});
		// Attach rejection handlers before release starts: EWRITE is expected test
		// data, never an unhandled process-level failure.
		const outcomesPromise = Promise.allSettled(writes);

		await lease.waitUntilDrained();
		await lease.release("abort");
		const outcomes = await outcomesPromise;
		assert.equal(outcomes.length, chunkCount);
		for (let index = 0; index < 4; index++) {
			assert.equal(
				outcomes[index]?.status,
				"fulfilled",
				`input sequence ${index + 1} was not explicitly acknowledged`,
			);
		}
		for (let index = 4; index < chunkCount; index++) {
			const outcome = outcomes[index];
			assert.equal(outcome?.status, "rejected");
			if (outcome?.status !== "rejected") continue;
			assert.match(
				String(outcome.reason),
				new RegExp(`sequence ${index + 1} \\(EWRITE\\)`),
			);
			assert.match(String(outcome.reason), /backlog exceeded hard limit/);
		}
	} finally {
		if (sessionPid) {
			try {
				process.kill(sessionPid, "SIGCONT");
			} catch {
				// Already exited.
			}
		}
		if (successor && sessionPid) {
			await successor.close(sessionId, "SIGKILL").catch(() => {});
		}
		await successor?.dispose().catch(() => {});
		await predecessor?.dispose().catch(() => {});
		killBestEffort(successorPid);
		killBestEffort(predecessorProcess.pid ?? null);
		unlinkSafe(localSocket);
	}
});

test("multiple local subscribers get fanned out from one wire subscription", async () => {
	const c = new DaemonClient({ socketPath: sockPath });
	await c.connect();

	const id = "host-test-fanout";
	await c.open(id, {
		shell: "/bin/sh",
		argv: ["-c", "echo fanout; sleep 0.3"],
		cols: 80,
		rows: 24,
	});

	const a: Buffer[] = [];
	const b: Buffer[] = [];
	const unsubA = c.subscribe(
		id,
		{ replay: true },
		{
			onOutput: (buf) => a.push(buf),
			onExit: () => {},
		},
	);
	// Second subscriber must use replay:false — the daemon's buffer was
	// already delivered to the first subscribe; requesting replay again
	// is now an explicit error (see DaemonClient.subscribe). The
	// fan-out applies to live output only.
	const unsubB = c.subscribe(
		id,
		{ replay: false },
		{
			onOutput: (buf) => b.push(buf),
			onExit: () => {},
		},
	);

	await new Promise((r) => setTimeout(r, 500));
	assert.ok(Buffer.concat(a).toString().includes("fanout"));
	assert.ok(Buffer.concat(b).toString().includes("fanout"));

	unsubA();
	unsubB();
	await c.dispose();
});

test("disconnect callback fires when daemon goes away", async () => {
	// Spin up a throw-away server we can shut down independently.
	const localPath = path.join(
		os.tmpdir(),
		`host-daemon-client-disc-${process.pid}.sock`,
	);
	const local = new Server({
		socketPath: localPath,
		daemonVersion: "0.0.0-disc",
	});
	await local.listen();

	const c = new DaemonClient({ socketPath: localPath });
	await c.connect();

	const disc = new Promise<void>((resolve) => {
		c.onDisconnect(() => resolve());
	});

	await local.close();
	await disc;
	assert.equal(c.isConnected, false);
	await c.dispose();
});

test("dispose resolves only after the socket can no longer deliver callbacks", async () => {
	const localPath = path.join(
		os.tmpdir(),
		`host-daemon-client-dispose-${process.pid}-${Math.random().toString(36).slice(2)}.sock`,
	);
	const sessionId = "dispose-close-fence";
	const local = net.createServer({ allowHalfOpen: true }, (socket) => {
		const decoder = new FrameDecoder();
		socket.on("data", (chunk) => {
			decoder.push(chunk);
			for (const frame of decoder.drain()) {
				const message = frame.message as ClientMessage;
				if (message.type === "hello") {
					socket.write(
						encodeFrame({
							type: "hello-ack",
							protocol: CURRENT_PROTOCOL_VERSION,
							daemonVersion: "dispose-close-fence-test",
							daemonPid: process.pid,
						}),
					);
				}
			}
		});
		socket.on("end", () => {
			socket.write(
				encodeFrame(
					{ type: "output", id: sessionId },
					Buffer.from("late-output"),
				),
			);
			socket.write(
				encodeFrame({
					type: "exit",
					id: sessionId,
					code: 0,
					signal: 0,
				}),
			);
			setTimeout(() => socket.end(), 20);
		});
	});
	await new Promise<void>((resolve, reject) => {
		local.once("error", reject);
		local.listen(localPath, () => {
			local.off("error", reject);
			resolve();
		});
	});

	const c = new DaemonClient({ socketPath: localPath });
	const events: string[] = [];
	try {
		await c.connect();
		c.subscribe(
			sessionId,
			{ replay: false },
			{
				onOutput: (chunk) => events.push(`output:${chunk.toString("utf8")}`),
				onExit: ({ code, signal }) => events.push(`exit:${code}:${signal}`),
			},
		);

		const firstDispose = c
			.dispose()
			.then(() => events.push("dispose-resolved:first"));
		const secondDispose = c
			.dispose()
			.then(() => events.push("dispose-resolved:second"));
		await Promise.all([firstDispose, secondDispose]);
		await new Promise((resolve) => setTimeout(resolve, 30));

		assert.deepEqual(events.slice(0, 2), ["output:late-output", "exit:0:0"]);
		assert.deepEqual(
			new Set(events.slice(2)),
			new Set(["dispose-resolved:first", "dispose-resolved:second"]),
		);
	} finally {
		await c.dispose();
		await new Promise<void>((resolve) => local.close(() => resolve()));
	}
});

test("dispose force-destroys a peer that never completes its close", async () => {
	const localPath = path.join(
		os.tmpdir(),
		`host-daemon-client-force-dispose-${process.pid}-${Math.random().toString(36).slice(2)}.sock`,
	);
	const accepted = new Set<net.Socket>();
	const local = net.createServer({ allowHalfOpen: true }, (socket) => {
		accepted.add(socket);
		socket.once("close", () => accepted.delete(socket));
		const decoder = new FrameDecoder();
		socket.on("data", (chunk) => {
			decoder.push(chunk);
			for (const frame of decoder.drain()) {
				const message = frame.message as ClientMessage;
				if (message.type === "hello") {
					socket.write(
						encodeFrame({
							type: "hello-ack",
							protocol: CURRENT_PROTOCOL_VERSION,
							daemonVersion: "dispose-force-close-test",
							daemonPid: process.pid,
						}),
					);
				}
			}
		});
		// Deliberately keep the writable half open after the client's FIN. The
		// client's bounded destroy fallback must turn this into a real close.
		socket.on("end", () => {});
	});
	await new Promise<void>((resolve, reject) => {
		local.once("error", reject);
		local.listen(localPath, () => {
			local.off("error", reject);
			resolve();
		});
	});

	const c = new DaemonClient({ socketPath: localPath });
	try {
		await c.connect();
		const startedAt = performance.now();
		await c.dispose();
		const elapsedMs = performance.now() - startedAt;
		assert.ok(
			elapsedMs >= 150,
			`dispose resolved too early after ${elapsedMs}ms`,
		);
		assert.ok(elapsedMs < 1500, `dispose force-close took ${elapsedMs}ms`);
		assert.equal(c.isConnected, false);
	} finally {
		await c.dispose();
		for (const socket of accepted) socket.destroy();
		await new Promise<void>((resolve) => local.close(() => resolve()));
	}
});

test("adoption flow: client A opens, drops, client B finds + subscribes-with-replay", async () => {
	// This is the exact host-service-restart sequence we hit in production:
	// host-service v1 opens a daemon session, then dies. host-service v2
	// starts fresh, calls daemon.open() blindly → "session already exists"
	// → must fall back to list() + subscribe(replay:true). Regression test
	// for the "session already exists" tight loop.
	const a = new DaemonClient({ socketPath: sockPath });
	await a.connect();
	const id = "host-restart-adopt";
	const openA = await a.open(id, {
		shell: "/bin/sh",
		argv: ["-i"],
		cols: 80,
		rows: 24,
	});
	const aChunks: Buffer[] = [];
	const unsubA = a.subscribe(
		id,
		{ replay: false },
		{ onOutput: (c) => aChunks.push(c), onExit: () => {} },
	);
	await a.input(id, Buffer.from("echo before-host-restart\n"));
	await waitFor(
		() => Buffer.concat(aChunks).toString().includes("before-host-restart"),
		3000,
	);
	unsubA();
	await a.dispose();

	// Brief settle so the daemon registers A's disconnect.
	await new Promise((r) => setTimeout(r, 100));

	// "host-service v2" connects fresh.
	const b = new DaemonClient({ socketPath: sockPath });
	await b.connect();

	// Naive open should error with "session already exists" — that's the
	// signal host-service uses to switch to adoption mode.
	let openErr: Error | null = null;
	try {
		await b.open(id, {
			shell: "/bin/sh",
			argv: ["-i"],
			cols: 80,
			rows: 24,
		});
	} catch (e) {
		openErr = e as Error;
	}
	assert.ok(openErr, "second open of same id must throw");
	assert.match(openErr?.message ?? "", /session already exists/);

	// list() finds the live session.
	const list = await b.list();
	const found = list.find((s) => s.id === id);
	assert.ok(found, "list must surface the existing session");
	assert.equal(found?.alive, true);
	assert.equal(found?.pid, openA.pid);

	// Subscribe with replay → see the buffered output from A's lifetime.
	const bChunks: Buffer[] = [];
	const unsubB = b.subscribe(
		id,
		{ replay: true },
		{ onOutput: (c) => bChunks.push(c), onExit: () => {} },
	);
	await waitFor(
		() => Buffer.concat(bChunks).toString().includes("before-host-restart"),
		3000,
	);

	// And new input through B reaches the (still-living) shell.
	await b.input(id, Buffer.from("echo after-host-restart\n"));
	await waitFor(
		() => Buffer.concat(bChunks).toString().includes("after-host-restart"),
		3000,
	);

	unsubB();
	await b.close(id, "SIGTERM");
	await b.dispose();
});

async function waitFor(
	predicate: () => boolean | Promise<boolean>,
	ms: number,
): Promise<void> {
	const start = Date.now();
	while (!(await predicate())) {
		if (Date.now() - start > ms) throw new Error("waitFor timed out");
		await new Promise((r) => setTimeout(r, 25));
	}
}

function spawnDaemonProcess(socketPath: string): childProcess.ChildProcess {
	return childProcess.spawn(
		process.execPath,
		[...process.execArgv, DAEMON_SCRIPT, `--socket=${socketPath}`],
		{ stdio: ["ignore", "ignore", "inherit"] },
	);
}

async function connectEventually(
	socketPath: string,
	timeoutMs = 5_000,
): Promise<DaemonClient> {
	const deadline = Date.now() + timeoutMs;
	let lastError: unknown;
	while (Date.now() < deadline) {
		const client = new DaemonClient({ socketPath, connectTimeoutMs: 500 });
		try {
			await client.connect();
			return client;
		} catch (error) {
			lastError = error;
			await client.dispose().catch(() => {});
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
	}
	throw lastError instanceof Error
		? lastError
		: new Error("timed out connecting to daemon");
}

function killBestEffort(pid: number | null): void {
	if (!pid) return;
	try {
		process.kill(pid, "SIGKILL");
	} catch {
		// Already exited.
	}
}

function unlinkSafe(filePath: string): void {
	try {
		fs.unlinkSync(filePath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
}

function legacyListReply(id: string) {
	return {
		type: "list-reply" as const,
		sessions: [{ id, pid: 123, cols: 80, rows: 24, alive: true }],
	};
}

function listenUnixServer(
	server: net.Server,
	socketPath: string,
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const onError = (error: Error) => reject(error);
		server.once("error", onError);
		server.listen(socketPath, () => {
			server.off("error", onError);
			resolve();
		});
	});
}

function closeServer(server: net.Server): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error) reject(error);
			else resolve();
		});
	});
}

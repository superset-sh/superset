// End-to-end test for DaemonClient against a real pty-daemon Server.
// Runs under Node (`node --experimental-strip-types --test`) because the
// daemon spawns real PTYs via node-pty.

import { strict as assert } from "node:assert";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { Server } from "@superset/pty-daemon";
import {
	type ClientMessage,
	CURRENT_PROTOCOL_VERSION,
	encodeFrame,
	FrameDecoder,
	SUPPORTED_PROTOCOL_VERSIONS,
} from "@superset/pty-daemon/protocol";
import { DaemonClient } from "./DaemonClient.ts";

const sockPath = path.join(
	os.tmpdir(),
	`host-daemon-client-${process.pid}.sock`,
);
let server: Server;

before(async () => {
	server = new Server({
		socketPath: sockPath,
		daemonVersion: "0.0.0-host-test",
	});
	await server.listen();
});

after(async () => {
	await server.close();
});

test("connect + handshake exposes daemon version", async () => {
	const c = new DaemonClient({ socketPath: sockPath });
	await c.connect();
	assert.equal(c.version, "0.0.0-host-test");
	assert.equal(c.protocol, CURRENT_PROTOCOL_VERSION);
	assert.ok(c.isConnected);
	await c.dispose();
});

test("negotiates v2 for legacy operations and guards snapshots", async () => {
	const legacyPath = path.join(
		os.tmpdir(),
		`host-daemon-client-v2-${process.pid}.sock`,
	);
	const legacyServer = net.createServer((socket) => {
		const decoder = new FrameDecoder();
		socket.on("data", (chunk) => {
			decoder.push(chunk);
			for (const frame of decoder.drain()) {
				const message = frame.message as ClientMessage;
				if (message.type === "hello") {
					assert.deepEqual(message.protocols, SUPPORTED_PROTOCOL_VERSIONS);
					socket.write(
						encodeFrame({
							type: "hello-ack",
							protocol: 2,
							daemonVersion: "0.2.5",
							daemonPid: process.pid,
						}),
					);
				} else if (message.type === "list") {
					socket.write(encodeFrame({ type: "list-reply", sessions: [] }));
				} else if (message.type === "prepare-upgrade") {
					socket.write(
						encodeFrame({
							type: "upgrade-prepared",
							result: { ok: true, successorPid: 4242 },
						}),
					);
				}
			}
		});
		socket.on("error", () => {});
	});
	await new Promise<void>((resolve) =>
		legacyServer.listen(legacyPath, resolve),
	);

	const client = new DaemonClient({ socketPath: legacyPath });
	try {
		await client.connect();
		assert.equal(client.protocol, 2);
		assert.equal(client.version, "0.2.5");
		assert.deepEqual(await client.list(), []);
		assert.deepEqual(await client.prepareUpgrade(), {
			ok: true,
			successorPid: 4242,
		});
		await assert.rejects(
			() => client.snapshot("legacy-session"),
			/requires protocol 3; connected with protocol 2/,
		);
	} finally {
		await client.dispose();
		await new Promise<void>((resolve) => legacyServer.close(() => resolve()));
	}
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

	c.input(id, Buffer.from("echo input-marker\n"));

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

test("snapshot reads buffered bytes repeatedly without subscribing", async () => {
	const c = new DaemonClient({ socketPath: sockPath });
	await c.connect();
	const id = "host-test-snapshot";
	await c.open(id, {
		shell: "/bin/sh",
		argv: ["-c", "printf snapshot-marker; sleep 2"],
		cols: 80,
		rows: 24,
	});

	await waitFor(
		async () => (await c.snapshot(id)).data.includes("snapshot-marker"),
		3000,
	);
	const first = await c.snapshot(id);
	const second = await c.snapshot(id);
	assert.ok(first.data.includes("snapshot-marker"));
	assert.deepEqual(second, first);
	assert.equal(first.truncated, false);

	await c.close(id, "SIGTERM");
	await c.dispose();
});

test("snapshot rejects an unknown terminal", async () => {
	const c = new DaemonClient({ socketPath: sockPath });
	await c.connect();
	await assert.rejects(() => c.snapshot("missing-snapshot"), /unknown session/);
	await c.dispose();
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
	a.input(id, Buffer.from("echo before-host-restart\n"));
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
	b.input(id, Buffer.from("echo after-host-restart\n"));
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

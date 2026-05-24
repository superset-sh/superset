// Daemon flow-control: subscribers that opt in via `flowControl: true` cause
// the PTY to pause once unacked output crosses the high watermark, and to
// resume once acks bring outstanding bytes back below the low watermark.

import { strict as assert } from "node:assert";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";
import type {
	Pty,
	PtyOnData,
	PtyOnExit,
	SpawnOptions,
} from "../src/Pty/index.ts";
import { Server } from "../src/Server/index.ts";
import { connectAndHello, type DaemonClient } from "./helpers/client.ts";

const sockPath = path.join(os.tmpdir(), `pty-daemon-flow-${process.pid}.sock`);

interface DriveablePty extends Pty {
	paused: boolean;
	pauseCount: number;
	resumeCount: number;
	emit(bytes: Uint8Array): void;
	finish(code: number): void;
}

let nextPid = 9000;
let lastSpawned: DriveablePty | null = null;

function makeDriveablePty(meta: SpawnOptions["meta"]): DriveablePty {
	const onDataCbs: PtyOnData[] = [];
	const onExitCbs: PtyOnExit[] = [];
	const pty = {
		pid: nextPid++,
		meta,
		paused: false as boolean,
		pauseCount: 0,
		resumeCount: 0,
		write: () => {},
		pause: () => {
			pty.paused = true;
			pty.pauseCount += 1;
		},
		resume: () => {
			pty.paused = false;
			pty.resumeCount += 1;
		},
		resize: () => {},
		kill: () => {},
		getMasterFd: () => -1,
		onData: (cb: PtyOnData) => {
			onDataCbs.push(cb);
		},
		onExit: (cb: PtyOnExit) => {
			onExitCbs.push(cb);
		},
		emit: (bytes: Uint8Array) => {
			for (const cb of onDataCbs) cb(Buffer.from(bytes));
		},
		finish: (code: number) => {
			for (const cb of onExitCbs) cb({ code, signal: null });
		},
	} satisfies DriveablePty;
	return pty;
}

let server: Server;

before(async () => {
	server = new Server({
		socketPath: sockPath,
		daemonVersion: "0.0.0-flow",
		bufferCap: 512 * 1024,
		spawnPty: ({ meta }) => {
			const pty = makeDriveablePty(meta);
			lastSpawned = pty;
			return pty;
		},
	});
	await server.listen();
});

after(async () => {
	await server.close();
});

const META = {
	shell: "/bin/sh",
	argv: [] as string[],
	cols: 80,
	rows: 24,
};

async function openPty(c: DaemonClient, id: string): Promise<DriveablePty> {
	lastSpawned = null;
	c.send({ type: "open", id, meta: META });
	await c.waitFor((m) => m.type === "open-ok" && m.id === id);
	assert.ok(lastSpawned, "spawnPty hook must have fired");
	return lastSpawned;
}

/**
 * Subscribe replies nothing on success; round-trip a `list` to ensure the
 * preceding `subscribe` has been processed before we drive the PTY.
 */
async function subscribe(
	c: DaemonClient,
	id: string,
	flowControl: boolean,
): Promise<void> {
	const reply = c.waitForNext((m) => m.type === "list-reply", 1000);
	c.send({ type: "subscribe", id, replay: false, flowControl });
	c.send({ type: "list" });
	await reply;
}

async function ackAndSettle(
	c: DaemonClient,
	id: string,
	bytes: number,
): Promise<void> {
	const reply = c.waitForNext((m) => m.type === "list-reply", 1000);
	c.send({ type: "ack-output", id, bytes });
	c.send({ type: "list" });
	await reply;
}

test("flowControl pauses PTY at high watermark, resumes once acked below low watermark", async () => {
	const c = await connectAndHello(sockPath);
	const id = "fc-basic";
	let pty: DriveablePty | null = null;
	try {
		pty = await openPty(c, id);
		await subscribe(c, id, true);

		// Single chunk above the 100 KB high watermark → pause exactly once.
		pty.emit(new Uint8Array(120_000));
		// Round-trip to make sure the pause callback has run.
		const reply = c.waitForNext((m) => m.type === "list-reply", 1000);
		c.send({ type: "list" });
		await reply;
		assert.equal(pty.pauseCount, 1, "PTY should be paused exactly once");
		assert.equal(pty.resumeCount, 0, "PTY should not have resumed yet");
		assert.equal(pty.paused, true);

		// Ack 110 KB — outstanding is now ~10 KB, still above the 5 KB low
		// watermark, so no resume yet.
		await ackAndSettle(c, id, 110_000);
		assert.equal(pty.resumeCount, 0, "should not resume above low watermark");
		assert.equal(pty.paused, true);

		// Ack the last ~10 KB — drops below 5 KB low watermark, resume fires.
		await ackAndSettle(c, id, 10_000);
		assert.equal(pty.resumeCount, 1, "PTY should resume exactly once");
		assert.equal(pty.paused, false);
	} finally {
		c.send({ type: "close", id });
		pty?.finish(0);
		await c.close();
	}
});

test("subscriber without flowControl does not pause the PTY", async () => {
	const c = await connectAndHello(sockPath);
	const id = "fc-disabled";
	let pty: DriveablePty | null = null;
	try {
		pty = await openPty(c, id);
		await subscribe(c, id, false);

		pty.emit(new Uint8Array(500_000));
		const reply = c.waitForNext((m) => m.type === "list-reply", 1000);
		c.send({ type: "list" });
		await reply;
		assert.equal(pty.pauseCount, 0, "no opt-in → no pause");
	} finally {
		c.send({ type: "close", id });
		pty?.finish(0);
		await c.close();
	}
});

test("connection drop releases unacked bytes and resumes paused PTY", async () => {
	const slow = await connectAndHello(sockPath);
	const opener = await connectAndHello(sockPath);
	const id = "fc-disconnect";
	let pty: DriveablePty | null = null;
	try {
		pty = await openPty(opener, id);
		await subscribe(slow, id, true);

		pty.emit(new Uint8Array(120_000));
		const reply = slow.waitForNext((m) => m.type === "list-reply", 1000);
		slow.send({ type: "list" });
		await reply;
		assert.equal(pty.pauseCount, 1);

		await slow.close();
		// Server learns about the close asynchronously; give it a moment, then
		// round-trip via the remaining connection to ensure dropConn has run.
		await new Promise((r) => setTimeout(r, 20));
		const reply2 = opener.waitForNext((m) => m.type === "list-reply", 1000);
		opener.send({ type: "list" });
		await reply2;
		assert.equal(
			pty.resumeCount,
			1,
			"dropping the slow conn should release its unacked bytes",
		);
		assert.equal(pty.paused, false);
	} finally {
		opener.send({ type: "close", id });
		pty?.finish(0);
		await opener.close();
	}
});

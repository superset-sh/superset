// Flow control: a flooding PTY with a slow consumer must pause the producer
// (kernel backpressure) instead of destroying the shared daemon socket.
//
// Regression: writeMessage() used to socket.destroy() when writableLength
// exceeded the outbound cap — one flooding terminal severed the connection
// for every session in the org.
//
// Runs under Node (`node --experimental-strip-types --test`).

import { strict as assert } from "node:assert";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { Server } from "../src/Server/index.ts";
import { connectAndHello, payloadAsString } from "./helpers/client.ts";

const sockPath = path.join(os.tmpdir(), `pty-daemon-flow-${process.pid}.sock`);
let server: Server;

// Small thresholds so the flood trips them in milliseconds. The old destroy
// behavior fires at outboundBufferCap; with flow control the buffer must stop
// growing at outboundPauseThreshold, far below the cap.
const PAUSE_THRESHOLD = 64 * 1024;
const DESTROY_CAP = 4 * 1024 * 1024;

const FLOOD_META = {
	shell: "/bin/sh",
	argv: ["-c", 'yes "flood-line-0123456789-abcdefghijklmnopqrstuvwxyz"'],
	cols: 80,
	rows: 24,
};

before(async () => {
	server = new Server({
		socketPath: sockPath,
		daemonVersion: "0.0.0-test",
		outboundPauseThreshold: PAUSE_THRESHOLD,
		outboundBufferCap: DESTROY_CAP,
	});
	await server.listen();
});

after(async () => {
	await server.close();
});

test("slow consumer pauses the flood instead of destroying the connection", async () => {
	const c = await connectAndHello(sockPath);
	c.send({ type: "open", id: "flow-0", meta: FLOOD_META });
	await c.waitFor((m) => m.type === "open-ok" && m.id === "flow-0");
	c.send({ type: "subscribe", id: "flow-0", replay: false });
	await c.waitFor(
		(m) => m.type === "output" && payloadAsString(m).includes("flood-line"),
		3000,
	);

	// Stop reading. At full `yes` rate the old behavior blows through any
	// buffer cap within this window and destroys the socket.
	c.socket.pause();
	await new Promise((r) => setTimeout(r, 1500));
	assert.equal(
		c.closed(),
		false,
		"daemon destroyed the shared connection under flood (flow control missing)",
	);

	// Resume reading: buffered output drains, PTY resumes, data flows again.
	c.socket.resume();
	await c.waitForNext(
		(m) => m.type === "output" && payloadAsString(m).includes("flood-line"),
		3000,
	);
	assert.equal(c.closed(), false);

	c.send({ type: "close", id: "flow-0", signal: "SIGKILL" });
	await c.waitFor((m) => m.type === "closed" && m.id === "flow-0", 3000);
	await c.close();
});

test("consumer disconnect while paused resumes the PTY for the next subscriber", async () => {
	const c1 = await connectAndHello(sockPath);
	c1.send({ type: "open", id: "flow-1", meta: FLOOD_META });
	await c1.waitFor((m) => m.type === "open-ok" && m.id === "flow-1");
	c1.send({ type: "subscribe", id: "flow-1", replay: false });
	await c1.waitFor((m) => m.type === "output" && m.id === "flow-1", 3000);

	// Congest c1 until the PTY is paused, then drop the socket hard. The
	// daemon must resume the PTY via the conn-drop path (a destroyed socket
	// never emits 'drain').
	c1.socket.pause();
	await new Promise((r) => setTimeout(r, 800));
	c1.socket.destroy();

	const c2 = await connectAndHello(sockPath);
	c2.send({ type: "subscribe", id: "flow-1", replay: false });
	await c2.waitFor(
		(m) =>
			m.type === "output" &&
			m.id === "flow-1" &&
			payloadAsString(m).includes("flood-line"),
		3000,
	);

	c2.send({ type: "close", id: "flow-1", signal: "SIGKILL" });
	await c2.waitFor((m) => m.type === "closed" && m.id === "flow-1", 3000);
	await c2.close();
});

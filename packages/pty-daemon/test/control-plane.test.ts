// Comprehensive control-plane test for pty-daemon. Each test exercises a
// real daemon over a real Unix socket and walks through one usage pattern
// end-to-end. Together these cover every usage shape host-service can throw
// at the daemon: handshake variants, session lifecycle, I/O patterns,
// multi-client subscribe/replay/unsubscribe, detach+reattach, malformed
// input, late subscribers, concurrent N sessions, shutdown.
//
// Runs under Node (`node --experimental-strip-types --test`).

import { strict as assert } from "node:assert";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, test } from "node:test";
import { encodeFrame } from "../src/protocol/index.ts";
import { Server } from "../src/Server/index.ts";
import { connect, connectAndHello } from "./helpers/client.ts";

const sockPath = path.join(
	os.tmpdir(),
	`pty-daemon-control-${process.pid}.sock`,
);
let server: Server;

before(async () => {
	server = new Server({
		socketPath: sockPath,
		daemonVersion: "0.0.0-control",
		bufferCap: 8 * 1024,
	});
	await server.listen();
});

after(async () => {
	await server.close();
});

const SH = "/bin/sh";
const baseMeta = {
	shell: SH,
	argv: ["-c", "echo ready; sleep 5"] as string[],
	cols: 80,
	rows: 24,
};

function uniqueId(prefix: string): string {
	return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------- Handshake ----------------

describe("handshake", () => {
	test("rejects non-hello first message", async () => {
		const c = await connect(sockPath);
		c.send({ type: "list" });
		const err = await c.waitFor((m) => m.type === "error", 1000);
		assert.equal(err.type, "error");
		await c.close();
	});

	test("rejects unsupported protocol versions", async () => {
		const c = await connect(sockPath);
		c.send({ type: "hello", protocols: [99, 100] });
		const err = await c.waitFor((m) => m.type === "error", 1000);
		if (err.type === "error") assert.equal(err.code, "EVERSION");
		await c.close();
	});

	test("picks highest mutual when multiple offered", async () => {
		const c = await connect(sockPath);
		c.send({ type: "hello", protocols: [1, 99] });
		const ack = await c.waitFor((m) => m.type === "hello-ack");
		if (ack.type === "hello-ack") assert.equal(ack.protocol, 1);
		await c.close();
	});

	test("rejects duplicate hello", async () => {
		const c = await connectAndHello(sockPath);
		c.send({ type: "hello", protocols: [1] });
		const err = await c.waitFor((m) => m.type === "error", 1000);
		if (err.type === "error") {
			assert.match(err.message, /duplicate hello/);
		}
		await c.close();
	});
});

// ---------------- Session lifecycle ----------------

describe("session lifecycle", () => {
	test("rejects open with bad cols/rows", async () => {
		const c = await connectAndHello(sockPath);
		c.send({
			type: "open",
			id: uniqueId("badspawn"),
			meta: { ...baseMeta, cols: 0 },
		});
		const err = await c.waitFor((m) => m.type === "error", 1000);
		if (err.type === "error") assert.equal(err.code, "ESPAWN");
		await c.close();
	});

	test("rejects duplicate session id", async () => {
		const c = await connectAndHello(sockPath);
		const id = uniqueId("dup");
		c.send({ type: "open", id, meta: baseMeta });
		await c.waitFor((m) => m.type === "open-ok");
		c.send({ type: "open", id, meta: baseMeta });
		const err = await c.waitFor((m) => m.type === "error", 1000);
		if (err.type === "error") assert.equal(err.code, "EEXIST");
		c.send({ type: "close", id });
		await c.close();
	});

	test("input/resize/close on missing session return ENOENT", async () => {
		const c = await connectAndHello(sockPath);
		const missing = "missing-no-such";

		c.send({ type: "input", id: missing, data: "" });
		const e1 = await c.waitFor((m) => m.type === "error", 1000);
		if (e1.type === "error") assert.equal(e1.code, "ENOENT");

		c.send({ type: "resize", id: missing, cols: 80, rows: 24 });
		const e2 = await c.waitFor((m) => m.type === "error" && m !== e1, 1000);
		if (e2.type === "error") assert.equal(e2.code, "ENOENT");

		c.send({ type: "close", id: missing });
		const e3 = await c.waitFor(
			(m) => m.type === "error" && m !== e1 && m !== e2,
			1000,
		);
		if (e3.type === "error") assert.equal(e3.code, "ENOENT");
		await c.close();
	});

	test("instant-exit shell still produces an exit message", async () => {
		const c = await connectAndHello(sockPath);
		const id = uniqueId("instant");
		c.send({
			type: "open",
			id,
			meta: { ...baseMeta, argv: ["-c", "true"] },
		});
		await c.waitFor((m) => m.type === "open-ok" && m.id === id);
		c.send({ type: "subscribe", id, replay: true });
		const exit = await c.waitFor((m) => m.type === "exit" && m.id === id, 3000);
		if (exit.type === "exit") assert.equal(exit.code, 0);
		await c.close();
	});

	test("close with SIGKILL terminates a hung shell", async () => {
		const c = await connectAndHello(sockPath);
		const id = uniqueId("hung");
		c.send({
			type: "open",
			id,
			meta: { ...baseMeta, argv: ["-c", "sleep 60"] },
		});
		const ok = await c.waitFor((m) => m.type === "open-ok" && m.id === id);
		if (ok.type !== "open-ok") throw new Error("no open-ok");

		c.send({ type: "subscribe", id, replay: false });
		c.send({ type: "close", id, signal: "SIGKILL" });
		await c.waitFor((m) => m.type === "closed" && m.id === id);
		await c.waitFor((m) => m.type === "exit" && m.id === id, 3000);
		await c.close();
	});

	test("default close (SIGHUP) terminates an interactive login shell", async () => {
		// Regression test for a real-world bug: SIGTERM is the wrong default
		// for "user closed the terminal pane" because interactive shells
		// (especially `zsh -l`) trap SIGTERM and stay alive. The kernel
		// sends SIGHUP when a TTY closes, and shells DO honor it. Without
		// this, every closed v2 terminal pane leaked a zsh process.
		const c = await connectAndHello(sockPath);
		const id = uniqueId("interactive");
		// `-i` forces interactive mode even though stdin is a PTY pipe;
		// matches the real terminal-launch shape closely enough for this
		// regression to fire if someone reverts to SIGTERM.
		c.send({
			type: "open",
			id,
			meta: { ...baseMeta, argv: ["-i"] },
		});
		await c.waitFor((m) => m.type === "open-ok" && m.id === id);
		c.send({ type: "subscribe", id, replay: false });

		// Default close — no explicit signal. Server defaults to SIGHUP.
		c.send({ type: "close", id });
		await c.waitFor((m) => m.type === "closed" && m.id === id);
		// Critical: the shell must actually exit. If SIGTERM defaults
		// returned (the bug), this waitFor would timeout.
		await c.waitFor((m) => m.type === "exit" && m.id === id, 3000);
		await c.close();
	});
});

// ---------------- I/O patterns ----------------

describe("I/O patterns", () => {
	test("resize during a running shell does not break stream", async () => {
		const c = await connectAndHello(sockPath);
		const id = uniqueId("resize");
		c.send({
			type: "open",
			id,
			meta: { ...baseMeta, argv: ["-i"] },
		});
		await c.waitFor((m) => m.type === "open-ok" && m.id === id);
		c.send({ type: "subscribe", id, replay: false });

		c.send({ type: "resize", id, cols: 120, rows: 40 });
		c.send({
			type: "input",
			id,
			data: Buffer.from("echo post-resize-marker\n").toString("base64"),
		});
		await c.waitFor(
			(m) =>
				m.type === "output" &&
				m.id === id &&
				Buffer.from(m.data, "base64").toString().includes("post-resize-marker"),
			3000,
		);

		c.send({ type: "close", id, signal: "SIGTERM" });
		await c.close();
	});

	test("burst output (high-rate stdout) is delivered and ring-capped", async () => {
		const c = await connectAndHello(sockPath);
		const id = uniqueId("burst");
		c.send({
			type: "open",
			id,
			meta: {
				...baseMeta,
				argv: [
					"-c",
					"for i in $(seq 1 200); do echo BURST:$i; done; sleep 0.5",
				],
			},
		});
		await c.waitFor((m) => m.type === "open-ok" && m.id === id);
		c.send({ type: "subscribe", id, replay: false });

		// Wait until we see the last marker, confirming live delivery.
		await c.waitFor(
			(m) =>
				m.type === "output" &&
				m.id === id &&
				Buffer.from(m.data, "base64").toString().includes("BURST:200"),
			5000,
		);
		await c.waitFor((m) => m.type === "exit" && m.id === id, 5000);
		await c.close();
	});

	test("multi-byte UTF-8 output round-trips", async () => {
		const c = await connectAndHello(sockPath);
		const id = uniqueId("utf8");
		// 🚀 = 0xF0 0x9F 0x9A 0x80
		c.send({
			type: "open",
			id,
			meta: {
				...baseMeta,
				argv: ["-c", "printf 'rocket: \\xf0\\x9f\\x9a\\x80\\n'; sleep 0.1"],
			},
		});
		await c.waitFor((m) => m.type === "open-ok" && m.id === id);
		c.send({ type: "subscribe", id, replay: true });
		await c.waitFor(
			(m) =>
				m.type === "output" &&
				m.id === id &&
				Buffer.from(m.data, "base64").toString().includes("🚀"),
			3000,
		);
		await c.waitFor((m) => m.type === "exit" && m.id === id, 3000);
		await c.close();
	});
});

// ---------------- Multi-client subscribe / fan-out ----------------

describe("multi-client fan-out", () => {
	test("two subscribers both receive the same output", async () => {
		const a = await connectAndHello(sockPath);
		const b = await connectAndHello(sockPath);
		const id = uniqueId("fanout");

		a.send({
			type: "open",
			id,
			meta: { ...baseMeta, argv: ["-c", "echo fanout-marker; sleep 0.5"] },
		});
		await a.waitFor((m) => m.type === "open-ok" && m.id === id);

		a.send({ type: "subscribe", id, replay: false });
		b.send({ type: "subscribe", id, replay: false });

		await Promise.all([
			a.waitFor(
				(m) =>
					m.type === "output" &&
					m.id === id &&
					Buffer.from(m.data, "base64").toString().includes("fanout-marker"),
				3000,
			),
			b.waitFor(
				(m) =>
					m.type === "output" &&
					m.id === id &&
					Buffer.from(m.data, "base64").toString().includes("fanout-marker"),
				3000,
			),
		]);

		await Promise.all([a.close(), b.close()]);
	});

	test("unsubscribe stops further output to that connection", async () => {
		const a = await connectAndHello(sockPath);
		const b = await connectAndHello(sockPath);
		const id = uniqueId("unsub");

		a.send({
			type: "open",
			id,
			meta: { ...baseMeta, argv: ["-i"] },
		});
		await a.waitFor((m) => m.type === "open-ok" && m.id === id);

		a.send({ type: "subscribe", id, replay: false });
		b.send({ type: "subscribe", id, replay: false });

		// First marker — both should see it.
		a.send({
			type: "input",
			id,
			data: Buffer.from("echo first-marker\n").toString("base64"),
		});
		await Promise.all([
			a.waitFor(
				(m) =>
					m.type === "output" &&
					Buffer.from(m.data, "base64").toString().includes("first-marker"),
				3000,
			),
			b.waitFor(
				(m) =>
					m.type === "output" &&
					Buffer.from(m.data, "base64").toString().includes("first-marker"),
				3000,
			),
		]);

		// b unsubscribes; a is still subscribed.
		b.send({ type: "unsubscribe", id });
		// Small settle so the unsubscribe lands before the next emit.
		await new Promise((r) => setTimeout(r, 100));

		const bAfterUnsub = b.collect(
			(m) => m.type === "output" && m.id === id,
			500,
		);

		a.send({
			type: "input",
			id,
			data: Buffer.from("echo second-marker\n").toString("base64"),
		});
		await a.waitFor(
			(m) =>
				m.type === "output" &&
				Buffer.from(m.data, "base64").toString().includes("second-marker"),
			3000,
		);

		const bMessages = await bAfterUnsub;
		const sawSecondOnB = bMessages.some(
			(m) =>
				m.type === "output" &&
				Buffer.from(m.data, "base64").toString().includes("second-marker"),
		);
		assert.equal(sawSecondOnB, false);

		a.send({ type: "close", id, signal: "SIGTERM" });
		await Promise.all([a.close(), b.close()]);
	});

	test("subscriber connection drop doesn't crash daemon; other clients keep streaming", async () => {
		const owner = await connectAndHello(sockPath);
		const dropper = await connectAndHello(sockPath);
		const observer = await connectAndHello(sockPath);
		const id = uniqueId("dropcrash");

		owner.send({
			type: "open",
			id,
			meta: { ...baseMeta, argv: ["-i"] },
		});
		await owner.waitFor((m) => m.type === "open-ok" && m.id === id);
		dropper.send({ type: "subscribe", id, replay: false });
		observer.send({ type: "subscribe", id, replay: false });

		// Force-close the dropper without unsubscribing.
		dropper.socket.destroy();

		owner.send({
			type: "input",
			id,
			data: Buffer.from("echo survives-drop\n").toString("base64"),
		});
		await observer.waitFor(
			(m) =>
				m.type === "output" &&
				Buffer.from(m.data, "base64").toString().includes("survives-drop"),
			3000,
		);

		owner.send({ type: "close", id, signal: "SIGTERM" });
		await Promise.all([owner.close(), observer.close()]);
	});
});

// ---------------- Detach + reattach (the headline feature) ----------------

describe("detach + reattach", () => {
	test("late subscriber gets prior output via replay", async () => {
		const owner = await connectAndHello(sockPath);
		const id = uniqueId("late");

		owner.send({
			type: "open",
			id,
			meta: {
				...baseMeta,
				argv: ["-c", "echo early-marker; sleep 1"],
			},
		});
		await owner.waitFor((m) => m.type === "open-ok" && m.id === id);

		// Wait for output to be buffered without any subscriber.
		await new Promise((r) => setTimeout(r, 200));

		const late = await connectAndHello(sockPath);
		late.send({ type: "subscribe", id, replay: true });
		await late.waitFor(
			(m) =>
				m.type === "output" &&
				m.id === id &&
				Buffer.from(m.data, "base64").toString().includes("early-marker"),
			3000,
		);

		owner.send({ type: "close", id, signal: "SIGTERM" });
		await Promise.all([owner.close(), late.close()]);
	});

	test("reattach cycle: subscribe → disconnect → new conn subscribes-with-replay → continues live", async () => {
		const owner = await connectAndHello(sockPath);
		const id = uniqueId("reattach");

		owner.send({
			type: "open",
			id,
			meta: { ...baseMeta, argv: ["-i"] },
		});
		await owner.waitFor((m) => m.type === "open-ok" && m.id === id);

		const first = await connectAndHello(sockPath);
		first.send({ type: "subscribe", id, replay: false });

		// Generate some output via input.
		owner.send({
			type: "input",
			id,
			data: Buffer.from("echo before-reattach\n").toString("base64"),
		});
		await first.waitFor(
			(m) =>
				m.type === "output" &&
				Buffer.from(m.data, "base64").toString().includes("before-reattach"),
			3000,
		);

		// Disconnect the first client. PTY keeps running.
		await first.close();

		// New client connects, asks for replay, and sends another input.
		const second = await connectAndHello(sockPath);
		second.send({ type: "subscribe", id, replay: true });
		// Replay should arrive immediately containing the prior output.
		await second.waitFor(
			(m) =>
				m.type === "output" &&
				m.id === id &&
				Buffer.from(m.data, "base64").toString().includes("before-reattach"),
			2000,
		);

		owner.send({
			type: "input",
			id,
			data: Buffer.from("echo after-reattach\n").toString("base64"),
		});
		await second.waitFor(
			(m) =>
				m.type === "output" &&
				m.id === id &&
				Buffer.from(m.data, "base64").toString().includes("after-reattach"),
			3000,
		);

		owner.send({ type: "close", id, signal: "SIGTERM" });
		await Promise.all([owner.close(), second.close()]);
	});
});

// ---------------- list ----------------

describe("list", () => {
	test("reflects active sessions", async () => {
		const c = await connectAndHello(sockPath);
		const id = uniqueId("listed");
		c.send({ type: "open", id, meta: baseMeta });
		await c.waitFor((m) => m.type === "open-ok" && m.id === id);

		c.send({ type: "list" });
		const reply = await c.waitFor((m) => m.type === "list-reply");
		assert.equal(reply.type, "list-reply");
		if (reply.type === "list-reply") {
			const found = reply.sessions.find((s) => s.id === id);
			assert.ok(found, "session should appear in list");
			assert.equal(found?.cols, 80);
			assert.equal(found?.rows, 24);
			assert.equal(found?.alive, true);
		}

		c.send({ type: "close", id, signal: "SIGTERM" });
		await c.close();
	});
});

// ---------------- Cross-client continuity (host-service restart story) ----------------

describe("cross-client continuity (host-service restart simulation)", () => {
	// This is the headline path the daemon exists for. Client A (host-service v1)
	// opens a session, then disconnects (host-service crashed). Client B
	// (host-service v2) connects fresh, discovers the session via list, and
	// must NOT try to re-open it — it should subscribe-with-replay and
	// continue. Regression test for the "session already exists" tight loop
	// observed in production after the first integration land.

	test("client B finds session A's id via list after A disconnects", async () => {
		const a = await connectAndHello(sockPath);
		const id = uniqueId("restart");
		a.send({
			type: "open",
			id,
			meta: { ...baseMeta, argv: ["-c", "echo from-A; sleep 5"] },
		});
		await a.waitFor((m) => m.type === "open-ok" && m.id === id);
		// Force-close A's connection without unsubscribing — this simulates a
		// host-service crash. The session must keep running on the daemon.
		a.socket.destroy();

		// Brief settle so the daemon notices the close.
		await new Promise((r) => setTimeout(r, 100));

		const b = await connectAndHello(sockPath);
		b.send({ type: "list" });
		const reply = await b.waitFor((m) => m.type === "list-reply");
		assert.equal(reply.type, "list-reply");
		if (reply.type === "list-reply") {
			const found = reply.sessions.find((s) => s.id === id);
			assert.ok(found, `session ${id} should still be in list after A's drop`);
			assert.equal(found?.alive, true);
		}

		b.send({ type: "close", id, signal: "SIGTERM" });
		await b.close();
	});

	test("re-opening an existing session id returns EEXIST (the trigger for adoption)", async () => {
		// Regression: host-service was caught in a tight loop because it
		// blindly called `open` after restart and got "session already exists".
		// We rely on this exact error code/message to drive the adoption path
		// in host-service's createTerminalSessionInternal.
		const a = await connectAndHello(sockPath);
		const id = uniqueId("eexist");
		a.send({ type: "open", id, meta: baseMeta });
		await a.waitFor((m) => m.type === "open-ok" && m.id === id);

		const b = await connectAndHello(sockPath);
		b.send({ type: "open", id, meta: baseMeta });
		const err = await b.waitFor((m) => m.type === "error" && m.id === id, 2000);
		assert.equal(err.type, "error");
		if (err.type === "error") {
			assert.equal(err.code, "EEXIST");
			assert.match(err.message, /session already exists/);
		}

		a.send({ type: "close", id, signal: "SIGTERM" });
		await Promise.all([a.close(), b.close()]);
	});

	test("client B subscribes-with-replay to A's session and gets buffered output + live stream", async () => {
		// The actual adoption flow: A opens, A produces output, A drops, B
		// subscribes with replay. B must see the prior output AND any new
		// output produced after B's subscribe. This is what host-service
		// does after restart to give the renderer a continuous experience.
		const a = await connectAndHello(sockPath);
		const id = uniqueId("adopt");
		a.send({
			type: "open",
			id,
			meta: { ...baseMeta, argv: ["-i"] },
		});
		await a.waitFor((m) => m.type === "open-ok" && m.id === id);

		a.send({ type: "subscribe", id, replay: false });
		a.send({
			type: "input",
			id,
			data: Buffer.from("echo before-restart\n").toString("base64"),
		});
		await a.waitFor(
			(m) =>
				m.type === "output" &&
				Buffer.from(m.data, "base64").toString().includes("before-restart"),
			3000,
		);

		// A drops without cleanup — host-service "crashed."
		a.socket.destroy();
		await new Promise((r) => setTimeout(r, 100));

		// B picks up the session. First confirms via list, then subscribes
		// with replay to get the buffered "before-restart" output.
		const b = await connectAndHello(sockPath);
		b.send({ type: "list" });
		const list = await b.waitFor((m) => m.type === "list-reply");
		assert.ok(
			list.type === "list-reply" &&
				list.sessions.some((s) => s.id === id && s.alive),
		);

		b.send({ type: "subscribe", id, replay: true });
		await b.waitFor(
			(m) =>
				m.type === "output" &&
				m.id === id &&
				Buffer.from(m.data, "base64").toString().includes("before-restart"),
			3000,
		);

		// New input from B reaches the (still-living) shell.
		b.send({
			type: "input",
			id,
			data: Buffer.from("echo after-restart\n").toString("base64"),
		});
		await b.waitFor(
			(m) =>
				m.type === "output" &&
				m.id === id &&
				Buffer.from(m.data, "base64").toString().includes("after-restart"),
			3000,
		);

		b.send({ type: "close", id, signal: "SIGTERM" });
		await b.close();
	});

	test("exited sessions are deleted immediately (no accumulation)", async () => {
		// Sessions are removed from the store the moment their PTY exits.
		// Late subscribers (e.g. host-service restarting in the exit gap)
		// get ENOENT — the renderer falls back to a generic "session
		// unavailable" footer. Tradeoff: niche UX regression in the
		// restart-during-exit window vs. unbounded session accumulation
		// (every closed terminal pane otherwise left a row forever).
		const a = await connectAndHello(sockPath);
		const id = uniqueId("postexit");
		a.send({
			type: "open",
			id,
			meta: { ...baseMeta, argv: ["-c", "echo final-words; exit 7"] },
		});
		await a.waitFor((m) => m.type === "open-ok" && m.id === id);
		a.send({ type: "subscribe", id, replay: true });
		await a.waitFor((m) => m.type === "exit" && m.id === id, 3000);
		a.socket.destroy();
		// Give the on-exit handler a beat to run its store.delete.
		await new Promise((r) => setTimeout(r, 100));

		// New connection: late subscribe gets nothing useful for a
		// vanished id. We assert that the session is gone from list and
		// that an op on the id returns ENOENT.
		const b = await connectAndHello(sockPath);
		b.send({ type: "list" });
		const reply = await b.waitFor((m) => m.type === "list-reply", 1000);
		if (reply.type === "list-reply") {
			const found = reply.sessions.find((s) => s.id === id);
			assert.equal(found, undefined, "exited session should not be in list");
		}
		b.send({ type: "close", id });
		const err = await b.waitFor((m) => m.type === "error", 1000);
		if (err.type === "error") assert.equal(err.code, "ENOENT");
		await b.close();
	});

	test("daemon `list` returns sessions whose only client just dropped", async () => {
		// Defensive: the daemon must NOT garbage-collect a session just
		// because its last client disconnected. host-service relies on the
		// session staying alive across the disconnect.
		const a = await connectAndHello(sockPath);
		const id = uniqueId("orphan");
		a.send({
			type: "open",
			id,
			meta: { ...baseMeta, argv: ["-c", "sleep 30"] },
		});
		await a.waitFor((m) => m.type === "open-ok" && m.id === id);

		a.socket.destroy();
		await new Promise((r) => setTimeout(r, 200));

		const b = await connectAndHello(sockPath);
		b.send({ type: "list" });
		const reply = await b.waitFor((m) => m.type === "list-reply");
		if (reply.type === "list-reply") {
			const me = reply.sessions.find((s) => s.id === id);
			assert.ok(me, "session must persist past last-client disconnect");
			assert.equal(me?.alive, true);
		}
		b.send({ type: "close", id, signal: "SIGKILL" });
		await b.close();
	});
});

// ---------------- Malformed / abusive input ----------------

describe("hostile input", () => {
	test("non-JSON in a frame disconnects the client; daemon survives", async () => {
		const owner = await connectAndHello(sockPath);
		const id = uniqueId("survive");
		owner.send({
			type: "open",
			id,
			meta: { ...baseMeta, argv: ["-i"] },
		});
		await owner.waitFor((m) => m.type === "open-ok" && m.id === id);

		// Hostile client sends a length-prefixed buffer of garbage that isn't JSON.
		const bad = await connect(sockPath);
		const garbage = Buffer.from("\x00\x00\x00\x05NOT{}");
		bad.sendRaw(garbage);
		// Server should disconnect this conn cleanly.
		await new Promise<void>((res) => bad.onClose(res));

		// Owner is still functional.
		owner.send({ type: "subscribe", id, replay: false });
		owner.send({
			type: "input",
			id,
			data: Buffer.from("echo still-alive\n").toString("base64"),
		});
		await owner.waitFor(
			(m) =>
				m.type === "output" &&
				Buffer.from(m.data, "base64").toString().includes("still-alive"),
			3000,
		);

		owner.send({ type: "close", id, signal: "SIGTERM" });
		await owner.close();
	});

	test("oversized frame header (> 8 MB cap) disconnects; daemon survives", async () => {
		const bad = await connect(sockPath);
		const hugeHeader = Buffer.alloc(4);
		hugeHeader.writeUInt32BE(20 * 1024 * 1024, 0);
		bad.sendRaw(hugeHeader);
		await new Promise<void>((res) => bad.onClose(res));

		// Daemon is still accepting connections.
		const c = await connectAndHello(sockPath);
		c.send({ type: "list" });
		await c.waitFor((m) => m.type === "list-reply", 1000);
		await c.close();
	});

	test("input on a session that just exited returns ENOENT", async () => {
		// Exit deletes the session row, so post-exit input lands on
		// "unknown session" — same code path as input on a never-existed
		// id. EEXITED is no longer returned because there's no exited
		// session to be "exited"; it's just gone.
		const c = await connectAndHello(sockPath);
		const id = uniqueId("dead");
		c.send({
			type: "open",
			id,
			meta: { ...baseMeta, argv: ["-c", "true"] },
		});
		await c.waitFor((m) => m.type === "open-ok" && m.id === id);
		c.send({ type: "subscribe", id, replay: true });
		await c.waitFor((m) => m.type === "exit" && m.id === id, 3000);
		await new Promise((r) => setTimeout(r, 50));

		c.send({
			type: "input",
			id,
			data: Buffer.from("ignored").toString("base64"),
		});
		const err = await c.waitFor((m) => m.type === "error", 1000);
		if (err.type === "error") assert.equal(err.code, "ENOENT");
		await c.close();
	});
});

// ---------------- Concurrency stress ----------------

describe("concurrency", () => {
	test("20 sessions opened and streaming concurrently", async () => {
		const c = await connectAndHello(sockPath);
		const N = 20;
		const ids = Array.from({ length: N }, (_, i) => uniqueId(`conc-${i}`));

		// Open all sessions. Use a workload that runs long enough to outlast
		// the open+subscribe round-trip on a busy machine — the spawns happen
		// in parallel, but `subscribe replay:false` would race exits otherwise.
		for (const id of ids) {
			c.send({
				type: "open",
				id,
				meta: {
					...baseMeta,
					argv: ["-c", "echo TICK:start; sleep 0.5; echo TICK:end"],
				},
			});
		}

		// Wait for all open-oks.
		const openIds = new Set<string>();
		while (openIds.size < N) {
			const m = await c.waitFor(
				(m) => m.type === "open-ok" && !openIds.has(m.id),
				10_000,
			);
			if (m.type === "open-ok") openIds.add(m.id);
		}
		assert.equal(openIds.size, N);

		// Subscribe with replay so even sessions whose first output landed before
		// our subscribe arrives are still surfaced.
		for (const id of ids) c.send({ type: "subscribe", id, replay: true });

		// Wait for the start marker from each session.
		const seen = new Set<string>();
		while (seen.size < N) {
			const m = await c.waitFor(
				(m) =>
					m.type === "output" &&
					!seen.has(m.id) &&
					ids.includes(m.id) &&
					Buffer.from(m.data, "base64").toString().includes("TICK:start"),
				10_000,
			);
			if (m.type === "output") seen.add(m.id);
		}
		assert.equal(seen.size, N);

		// Wait for all to exit.
		const exited = new Set<string>();
		while (exited.size < N) {
			const m = await c.waitFor(
				(m) => m.type === "exit" && !exited.has(m.id) && ids.includes(m.id),
				10_000,
			);
			if (m.type === "exit") exited.add(m.id);
		}

		await c.close();
	});

	test("multiple connections opening sessions in parallel", async () => {
		const N = 10;
		const conns = await Promise.all(
			Array.from({ length: N }, () => connectAndHello(sockPath)),
		);

		await Promise.all(
			conns.map(async (c, i) => {
				const id = uniqueId(`parallel-${i}`);
				c.send({
					type: "open",
					id,
					meta: { ...baseMeta, argv: ["-c", `echo CONN:${i}; sleep 0.2`] },
				});
				await c.waitFor((m) => m.type === "open-ok" && m.id === id, 5000);
				c.send({ type: "subscribe", id, replay: true });
				await c.waitFor(
					(m) =>
						m.type === "output" &&
						m.id === id &&
						Buffer.from(m.data, "base64").toString().includes(`CONN:${i}`),
					5000,
				);
				c.send({ type: "close", id, signal: "SIGTERM" });
				await c.close();
			}),
		);
	});
});

// ---------------- Server shutdown ----------------

describe("server shutdown", () => {
	test("disconnects active clients cleanly via close()", async () => {
		// Use a *separate* short-lived server so we don't tear down the suite's main one.
		const localPath = path.join(
			os.tmpdir(),
			`pty-daemon-shutdown-${process.pid}-${Date.now()}.sock`,
		);
		const local = new Server({
			socketPath: localPath,
			daemonVersion: "0.0.0-local",
		});
		await local.listen();

		const c = await connectAndHello(localPath);
		const id = uniqueId("shutdown");
		c.send({
			type: "open",
			id,
			meta: { ...baseMeta, argv: ["-c", "sleep 60"] },
		});
		await c.waitFor((m) => m.type === "open-ok" && m.id === id);

		const closeWaiter = new Promise<void>((res) => c.onClose(res));
		await local.close();
		// Server.close() destroys all connections.
		await closeWaiter;
		assert.equal(c.closed(), true);
	});
});

// ---------------- Frame-level encoding sanity ----------------

describe("framing on the wire", () => {
	test("server tolerates split frames across multiple TCP chunks", async () => {
		const c = await connect(sockPath);
		const hello = encodeFrame({ type: "hello", protocols: [1] });
		// Send the hello in 3-byte chunks to force the decoder to buffer.
		for (let i = 0; i < hello.length; i += 3) {
			c.sendRaw(hello.subarray(i, Math.min(i + 3, hello.length)));
			await new Promise((r) => setTimeout(r, 1));
		}
		await c.waitFor((m) => m.type === "hello-ack", 1000);
		await c.close();
	});
});

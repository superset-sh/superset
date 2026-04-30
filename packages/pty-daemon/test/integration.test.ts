// Smoke / happy-path integration test for pty-daemon.
//
// Runs under Node (`node --experimental-strip-types --test`); see
// test/control-plane.test.ts for the exhaustive control-plane scenarios.

import { strict as assert } from "node:assert";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { Server } from "../src/Server/index.ts";
import { connect, connectAndHello } from "./helpers/client.ts";

const sockPath = path.join(os.tmpdir(), `pty-daemon-smoke-${process.pid}.sock`);
let server: Server;

before(async () => {
	server = new Server({ socketPath: sockPath, daemonVersion: "0.0.0-test" });
	await server.listen();
});

after(async () => {
	await server.close();
});

test("handshake: hello → hello-ack", async () => {
	const c = await connect(sockPath);
	c.send({ type: "hello", protocols: [1] });
	const ack = await c.waitFor((m) => m.type === "hello-ack");
	assert.equal(ack.type, "hello-ack");
	if (ack.type === "hello-ack") {
		assert.equal(ack.protocol, 1);
		assert.equal(ack.daemonVersion, "0.0.0-test");
	}
	await c.close();
});

test("open → subscribe → output → exit lifecycle", async () => {
	const c = await connectAndHello(sockPath);
	c.send({
		type: "open",
		id: "smoke-0",
		meta: {
			shell: "/bin/sh",
			argv: ["-c", "echo daemon-smoke; sleep 0.2"],
			cols: 80,
			rows: 24,
		},
	});
	await c.waitFor((m) => m.type === "open-ok" && m.id === "smoke-0");
	c.send({ type: "subscribe", id: "smoke-0", replay: true });

	await c.waitFor(
		(m) =>
			m.type === "output" &&
			m.id === "smoke-0" &&
			Buffer.from(m.data, "base64").toString().includes("daemon-smoke"),
		3000,
	);
	const exit = await c.waitFor(
		(m) => m.type === "exit" && m.id === "smoke-0",
		3000,
	);
	if (exit.type === "exit") assert.equal(exit.code, 0);
	await c.close();
});

test("input is forwarded and echoed via output", async () => {
	const c = await connectAndHello(sockPath);
	c.send({
		type: "open",
		id: "smoke-1",
		meta: { shell: "/bin/sh", argv: ["-i"], cols: 80, rows: 24 },
	});
	await c.waitFor((m) => m.type === "open-ok");
	c.send({ type: "subscribe", id: "smoke-1", replay: false });
	c.send({
		type: "input",
		id: "smoke-1",
		data: Buffer.from("echo abc-marker\n").toString("base64"),
	});
	await c.waitFor(
		(m) =>
			m.type === "output" &&
			m.id === "smoke-1" &&
			Buffer.from(m.data, "base64").toString().includes("abc-marker"),
		3000,
	);
	c.send({ type: "close", id: "smoke-1", signal: "SIGTERM" });
	await c.waitFor((m) => m.type === "closed" && m.id === "smoke-1");
	await c.close();
});

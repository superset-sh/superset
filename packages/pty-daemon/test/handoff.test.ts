// Phase 2 cross-process handoff: spawn a real daemon binary, open a
// session, send `prepare-upgrade`, and verify the successor adopted the
// session and serves new connections on the same socket.
//
// Runs under Node (`node --experimental-strip-types --test`).

import { strict as assert } from "node:assert";
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	accumulatedOutputAsString,
	connectAndHello,
} from "./helpers/client.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const DAEMON_SCRIPT = path.resolve(here, "..", "src", "main.ts");

const sockPath = path.join(
	os.tmpdir(),
	`pty-daemon-handoff-${process.pid}.sock`,
);

let daemonA: childProcess.ChildProcess | null = null;

function unlinkSafe(p: string): void {
	try {
		fs.unlinkSync(p);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
	}
}

function spawnDaemon(socketPath: string): childProcess.ChildProcess {
	return childProcess.spawn(
		process.execPath,
		[...process.execArgv, DAEMON_SCRIPT, `--socket=${socketPath}`],
		{ stdio: ["ignore", "inherit", "inherit"] },
	);
}

async function waitForSocket(p: string, timeoutMs = 3_000): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			fs.statSync(p);
			return;
		} catch {
			await new Promise((r) => setTimeout(r, 50));
		}
	}
	throw new Error(`socket ${p} not ready in ${timeoutMs}ms`);
}

before(async () => {
	unlinkSafe(sockPath);
	daemonA = spawnDaemon(sockPath);
	await waitForSocket(sockPath);
});

after(async () => {
	if (daemonA && daemonA.exitCode === null) {
		daemonA.kill("SIGTERM");
		await new Promise((r) => setTimeout(r, 100));
	}
	unlinkSafe(sockPath);
});

test("prepare-upgrade hands off live sessions to a successor binary", async () => {
	// Open a session on daemon A.
	const c1 = await connectAndHello(sockPath);
	c1.send({
		type: "open",
		id: "handoff-0",
		meta: {
			shell: "/bin/sh",
			argv: [],
			cols: 80,
			rows: 24,
		},
	});
	const opened = await c1.waitFor((m) => m.type === "open-ok");
	assert.equal(opened.type, "open-ok");
	const originalPid = opened.type === "open-ok" ? opened.pid : -1;

	// Trigger handoff.
	c1.send({ type: "prepare-upgrade" });
	const reply = await c1.waitFor((m) => m.type === "upgrade-prepared", 10_000);
	assert.equal(reply.type, "upgrade-prepared");
	if (reply.type !== "upgrade-prepared") return;
	assert.equal(reply.result.ok, true, JSON.stringify(reply.result));
	const successorPid =
		reply.result.ok === true ? reply.result.successorPid : -1;
	assert.ok(successorPid > 0, "successor pid should be set");

	// Wait for daemon A to exit.
	await new Promise<void>((resolve) => {
		if (!daemonA || daemonA.exitCode !== null) return resolve();
		daemonA.once("exit", () => resolve());
	});

	// Reconnect — should hit the successor.
	let c2: Awaited<ReturnType<typeof connectAndHello>> | null = null;
	const reconnectStart = Date.now();
	while (Date.now() - reconnectStart < 5_000) {
		try {
			c2 = await connectAndHello(sockPath);
			break;
		} catch {
			await new Promise((r) => setTimeout(r, 50));
		}
	}
	assert.ok(c2, "should have reconnected to successor within 5s");

	// Successor should still know about handoff-0 and report it as alive
	// with the original shell pid intact.
	c2.send({ type: "list" });
	const list = await c2.waitFor((m) => m.type === "list-reply");
	assert.equal(list.type, "list-reply");
	if (list.type !== "list-reply") return;
	const survived = list.sessions.find((s) => s.id === "handoff-0");
	assert.ok(
		survived,
		`expected handoff-0 in survivor list: ${JSON.stringify(list.sessions)}`,
	);
	assert.equal(survived.alive, true, "session should still be alive");
	assert.equal(
		survived.pid,
		originalPid,
		`shell pid should match across handoff (was ${originalPid}, got ${survived.pid})`,
	);

	// The adopted session must still accept input after the binary swap.
	// Regression coverage for sessions that survived handoff but stopped
	// being writable.
	c2.send({ type: "subscribe", id: "handoff-0", replay: false });
	c2.send(
		{ type: "input", id: "handoff-0" },
		Buffer.from("printf 'after-handoff-write\\n'\n"),
	);
	await c2.waitFor(
		(m) =>
			m.type === "output" &&
			m.id === "handoff-0" &&
			accumulatedOutputAsString(c2, "handoff-0").includes(
				"after-handoff-write",
			),
		5_000,
	);

	// Cleanup: close the surviving session.
	c2.send({ type: "close", id: "handoff-0", signal: "SIGKILL" });
	await c2.waitFor((m) => m.type === "closed" && m.id === "handoff-0", 2_000);
	await c2.close();

	// Reap the successor for the after() hook.
	try {
		process.kill(successorPid, "SIGTERM");
	} catch {
		// already gone
	}
});

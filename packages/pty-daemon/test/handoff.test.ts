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
import type { SessionInfo } from "../src/protocol/index.ts";
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
	const sessionIds = ["handoff-0", "handoff-1"] as const;
	const originalPids = new Map<string, number>();

	// Open sessions on daemon A. Two sessions catches fd-index mixups that a
	// single-session handoff can never expose.
	const c1 = await connectAndHello(sockPath);
	for (const id of sessionIds) {
		c1.send({
			type: "open",
			id,
			meta: {
				shell: "/bin/sh",
				argv: [],
				cols: 80,
				rows: 24,
			},
		});
		const opened = await c1.waitFor((m) => m.type === "open-ok" && m.id === id);
		assert.equal(opened.type, "open-ok");
		if (opened.type === "open-ok") originalPids.set(id, opened.pid);
	}

	// Produce output before handoff. The successor must carry this replay
	// buffer forward when it adopts the session from the predecessor.
	for (const id of sessionIds) {
		const marker = `before-handoff-replay-${id}`;
		c1.send({ type: "subscribe", id, replay: false });
		c1.send({ type: "input", id }, Buffer.from(`printf '${marker}\\n'\n`));
		await c1.waitFor(
			(m) =>
				m.type === "output" &&
				m.id === id &&
				accumulatedOutputAsString(c1, id).includes(marker),
			5_000,
		);
	}

	// Trigger handoff.
	c1.send({ type: "prepare-upgrade" });
	const reply = await c1.waitFor((m) => m.type === "upgrade-prepared", 10_000);
	assert.equal(reply.type, "upgrade-prepared");
	if (reply.type !== "upgrade-prepared") return;
	assert.equal(reply.result.ok, true, JSON.stringify(reply.result));
	const successorPid =
		reply.result.ok === true ? reply.result.successorPid : -1;
	assert.ok(successorPid > 0, "successor pid should be set");

	let c2: Awaited<ReturnType<typeof connectAndHello>> | null = null;
	let c3: Awaited<ReturnType<typeof connectAndHello>> | null = null;
	try {
		// Wait for daemon A to exit.
		await new Promise<void>((resolve) => {
			if (!daemonA || daemonA.exitCode !== null) return resolve();
			daemonA.once("exit", () => resolve());
		});

		// Reconnect — should hit the successor.
		const reconnectStart = Date.now();
		while (Date.now() - reconnectStart < 5_000) {
			try {
				c2 = await connectAndHello(sockPath);
				break;
			} catch {
				await new Promise((r) => setTimeout(r, 50));
			}
		}
		if (!c2) throw new Error("should have reconnected to successor within 5s");
		const adoptedClient = c2;

		// Successor should still know about every session and report them as
		// alive with the original shell pids intact.
		adoptedClient.send({ type: "list" });
		const list = await adoptedClient.waitFor((m) => m.type === "list-reply");
		assert.equal(list.type, "list-reply");
		if (list.type !== "list-reply") return;
		for (const id of sessionIds) {
			const survived: SessionInfo | undefined = list.sessions.find(
				(s) => s.id === id,
			);
			assert.ok(
				survived,
				`expected ${id} in survivor list: ${JSON.stringify(list.sessions)}`,
			);
			assert.equal(survived.alive, true, `${id} should still be alive`);
			assert.equal(
				survived.pid,
				originalPids.get(id),
				`${id} shell pid should match across handoff`,
			);
		}

		// Adopted sessions must still accept input after the binary swap.
		// Regression coverage for sessions that survived handoff but stopped
		// writable or had their inherited fds crossed.
		for (const id of sessionIds) {
			const beforeMarker = `before-handoff-replay-${id}`;
			const afterMarker = `after-handoff-write-${id}`;
			adoptedClient.send({ type: "subscribe", id, replay: true });
			await adoptedClient.waitFor(
				(m) =>
					m.type === "output" &&
					m.id === id &&
					accumulatedOutputAsString(adoptedClient, id).includes(beforeMarker),
				5_000,
			);
			adoptedClient.send(
				{ type: "input", id },
				Buffer.from(`printf '${afterMarker}\\n'\n`),
			);
			await adoptedClient.waitFor(
				(m) =>
					m.type === "output" &&
					m.id === id &&
					accumulatedOutputAsString(adoptedClient, id).includes(afterMarker),
				5_000,
			);
		}

		// A later client should be able to attach to adopted sessions and replay
		// both predecessor-buffered bytes and output produced after adoption.
		const lateClient = await connectAndHello(sockPath);
		c3 = lateClient;
		for (const id of sessionIds) {
			lateClient.send({ type: "subscribe", id, replay: true });
			await lateClient.waitFor(
				(m) =>
					m.type === "output" &&
					m.id === id &&
					accumulatedOutputAsString(lateClient, id).includes(
						`before-handoff-replay-${id}`,
					) &&
					accumulatedOutputAsString(lateClient, id).includes(
						`after-handoff-write-${id}`,
					),
				5_000,
			);
		}

		// Cleanup: close the surviving sessions. Register all exit waiters
		// before the first close so an early exit for a later session cannot
		// land before its waiter exists.
		const exitAfterClose = new Map(
			sessionIds.map((id) => [
				id,
				adoptedClient.waitForNext(
					(m) => m.type === "exit" && m.id === id,
					5_000,
				),
			]),
		);
		for (const id of sessionIds) {
			adoptedClient.send({ type: "close", id, signal: "SIGKILL" });
			await adoptedClient.waitFor(
				(m) => m.type === "closed" && m.id === id,
				2_000,
			);
		}
		await Promise.all(exitAfterClose.values());

		const afterCloseListPromise = adoptedClient.waitForNext(
			(m) => m.type === "list-reply",
			2_000,
		);
		adoptedClient.send({ type: "list" });
		const afterCloseList = await afterCloseListPromise;
		assert.equal(afterCloseList.type, "list-reply");
		if (afterCloseList.type === "list-reply") {
			for (const id of sessionIds) {
				assert.equal(
					afterCloseList.sessions.some((s) => s.id === id),
					false,
					`closed adopted session ${id} should be removed from list: ${JSON.stringify(afterCloseList.sessions)}`,
				);
			}
		}
	} finally {
		await Promise.all([c1.close(), c2?.close(), c3?.close()]);
		// Reap the successor for the after() hook, including assertion failures
		// above; otherwise a failed handoff assertion can keep the test runner open.
		try {
			process.kill(successorPid, "SIGTERM");
		} catch {
			// already gone
		}
	}
});

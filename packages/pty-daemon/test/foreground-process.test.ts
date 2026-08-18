// Real-PTY coverage for hasRunningForegroundProcess. node-pty's runtime needs
// Node (not bun), so this lives with the integration suite. It exercises the
// load-bearing tpgid != pgid comparison that the bun unit tests can't reach:
// an idle prompt reports not-running, a foreground command reports running,
// and it flips back once the command exits.

import { strict as assert } from "node:assert";
import { after, test } from "node:test";
import { type Pty, spawn as spawnPty } from "../src/Pty/Pty.ts";
import { hasRunningForegroundProcess } from "../src/process-tree.ts";

const ptys: Pty[] = [];

after(() => {
	for (const p of ptys) {
		try {
			p.kill("SIGKILL");
		} catch {
			// already gone
		}
	}
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(
	predicate: () => boolean,
	timeoutMs: number,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) return true;
		await sleep(50);
	}
	return predicate();
}

test("idle prompt -> running command -> idle again", async () => {
	const pty = spawnPty({
		meta: {
			shell: "/bin/bash",
			argv: ["--norc", "--noprofile", "-i"],
			cols: 80,
			rows: 24,
		},
	});
	ptys.push(pty);
	// Sink output so the pty isn't backpressured.
	pty.onData(() => {});

	// Shell needs a moment to take the foreground process group.
	const idle = await waitFor(() => !hasRunningForegroundProcess(pty.pid), 4000);
	assert.equal(idle, true, "idle shell should report no running process");

	pty.write(Buffer.from("sleep 3\n", "utf8"));
	const running = await waitFor(
		() => hasRunningForegroundProcess(pty.pid),
		4000,
	);
	assert.equal(running, true, "foreground command should report running");

	// `sleep 3` finishes; the shell reclaims the foreground group.
	const backToIdle = await waitFor(
		() => !hasRunningForegroundProcess(pty.pid),
		6000,
	);
	assert.equal(
		backToIdle,
		true,
		"after the command exits the shell should report not running",
	);
});

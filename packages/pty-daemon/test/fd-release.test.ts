// Regression test for superset-sh/superset#5699.
//
// node-pty 1.1.0's macOS `pty_posix_spawn` leaks one /dev/ptmx master fd on
// EVERY spawn: its low-fd workaround probes `posix_openpt` into `low_fds`,
// but the cleanup loop (`for (; count > 0; count--)`) never closes
// `low_fds[0]` — and in practice the first probe always lands at fd >= 3, so
// nothing is ever closed. Each leaked master counts against the system-wide
// pty cap (kern.tty.ptmx_max = 511 on macOS); a long-lived daemon eventually
// starves the whole machine of ptys and no app can open a terminal until
// reboot. Fixed upstream in microsoft/node-pty#882 (unreleased as of 1.1.0);
// backported via patches/node-pty@1.1.0.patch.
//
// These tests spawn real shells, so they run under Node with the rest of the
// integration suite.

import { strict as assert } from "node:assert";
import * as cp from "node:child_process";
import * as fs from "node:fs";
import { test } from "node:test";
import { spawn as spawnPty } from "../src/Pty/Pty.ts";

/** Count this process's open pty fds (masters and slaves), like upstream's
 * regression test for microsoft/node-pty#882 does. */
function ptyFdCount(): number {
	const out = cp.execSync(`lsof -p ${process.pid} 2>/dev/null || true`, {
		encoding: "utf8",
	});
	return out.split("\n").filter((line) => /\/dev\/(ptmx|ttys)/.test(line))
		.length;
}

function fdIsOpen(fd: number): boolean {
	try {
		fs.fstatSync(fd);
		return true;
	} catch {
		return false;
	}
}

async function waitUntil(
	pred: () => boolean,
	timeoutMs = 5_000,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (pred()) return true;
		await new Promise((r) => setTimeout(r, 50));
	}
	return pred();
}

function spawnAndAwaitExit(argv: string[]): Promise<void> {
	const pty = spawnPty({
		meta: { shell: "/bin/sh", argv, cols: 80, rows: 24 },
	});
	return new Promise((resolve) => pty.onExit(() => resolve()));
}

test("spawning and exiting sessions does not accumulate pty fds", async () => {
	const initial = ptyFdCount();

	for (let i = 0; i < 10; i++) {
		await spawnAndAwaitExit(["-c", "exit 0"]);
	}

	assert.equal(
		await waitUntil(() => ptyFdCount() <= initial),
		true,
		`leaked ${ptyFdCount() - initial} pty fds after 10 spawn/exit cycles (initial ${initial})`,
	);
});

test("no pty fd accumulates when a background child outlives the shell", async () => {
	// The backgrounded sleep inherits the slave tty and outlives the shell —
	// the pattern agent/background-helper sessions hit constantly.
	const initial = ptyFdCount();

	for (let i = 0; i < 5; i++) {
		await spawnAndAwaitExit(["-c", "sleep 30 & exit 0"]);
	}

	assert.equal(
		await waitUntil(() => ptyFdCount() <= initial),
		true,
		`leaked ${ptyFdCount() - initial} pty fds after 5 bg-child sessions (initial ${initial})`,
	);
});

test("master fd is closed after the shell exits", async () => {
	const pty = spawnPty({
		meta: { shell: "/bin/sh", argv: ["-c", "exit 0"], cols: 80, rows: 24 },
	});
	const fd = pty.getMasterFd();
	assert.equal(fdIsOpen(fd), true, "master fd should be open while running");

	await new Promise<void>((resolve) => pty.onExit(() => resolve()));

	assert.equal(
		await waitUntil(() => !fdIsOpen(fd)),
		true,
		"master fd must be closed once the session exits",
	);
});

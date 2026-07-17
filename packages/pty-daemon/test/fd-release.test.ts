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
// The same macOS path also leaks one kqueue fd per spawn (`SetupExitCallback`
// opens a kqueue to wait on NOTE_EXIT and never closes it) — that one counts
// against the process's RLIMIT_NOFILE rather than the pty cap. Fixed upstream
// in microsoft/node-pty#931 and backported in the same patch.
//
// These tests spawn real shells, so they run under Node with the rest of the
// integration suite.

import { strict as assert } from "node:assert";
import * as cp from "node:child_process";
import * as fs from "node:fs";
import { test } from "node:test";
import { spawn as spawnPty } from "../src/Pty/Pty.ts";
import { waitFor } from "./helpers/wait-for.ts";

/**
 * Count this process's open pty fds (masters and slaves), like upstream's
 * regression test for microsoft/node-pty#882 does. Matches macOS
 * (/dev/ptmx, /dev/ttysNNN) and Linux (/dev/ptmx, /dev/pts/N) names.
 * Throws when lsof yields nothing — a live process always has some open
 * fds, so empty output means the count is broken, and returning 0 would
 * make every assertion below pass vacuously.
 */
function ptyFdCount(): number {
	let out: string;
	try {
		out = cp.execSync(`lsof -p ${process.pid}`, {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch (err) {
		// lsof exits non-zero for some unresolvable fds while still printing
		// the rest — use whatever it produced.
		out = (err as { stdout?: string }).stdout ?? "";
	}
	if (!out.trim()) {
		throw new Error("lsof produced no output — cannot count pty fds");
	}
	return out.split("\n").filter((line) => /\/dev\/(ptmx|ttys|pts\/)/.test(line))
		.length;
}

/** Count this process's open kqueue fds, like upstream's regression test
 * for microsoft/node-pty#931 does. macOS-only (lsof TYPE column). */
function kqueueFdCount(): number {
	let out: string;
	try {
		out = cp.execSync(`lsof -p ${process.pid}`, {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch (err) {
		out = (err as { stdout?: string }).stdout ?? "";
	}
	if (!out.trim()) {
		throw new Error("lsof produced no output — cannot count kqueue fds");
	}
	return out.split("\n").filter((line) => line.includes("KQUEUE")).length;
}

function fdIsOpen(fd: number): boolean {
	try {
		fs.fstatSync(fd);
		return true;
	} catch {
		return false;
	}
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

	const converged = await waitFor(() => ptyFdCount() <= initial);
	if (!converged) {
		assert.fail(
			`leaked ${ptyFdCount() - initial} pty fds after 10 spawn/exit cycles (initial ${initial})`,
		);
	}
});

test("no pty fd accumulates when a background child outlives the shell", async () => {
	// The backgrounded sleep inherits the slave tty and outlives the shell —
	// the pattern agent/background-helper sessions hit constantly. The child
	// holds the slave in its own process; the daemon's fd table must still
	// return to baseline.
	const initial = ptyFdCount();

	for (let i = 0; i < 5; i++) {
		await spawnAndAwaitExit(["-c", "sleep 5 & exit 0"]);
	}

	const converged = await waitFor(() => ptyFdCount() <= initial);
	if (!converged) {
		assert.fail(
			`leaked ${ptyFdCount() - initial} pty fds after 5 bg-child sessions (initial ${initial})`,
		);
	}
});

test("spawning and exiting sessions does not accumulate kqueue fds", async (t) => {
	if (process.platform !== "darwin") {
		// The kqueue exit-watcher only exists on the macOS native path.
		t.skip("kqueue exit-watcher is macOS-only");
		return;
	}
	const initial = kqueueFdCount();

	for (let i = 0; i < 10; i++) {
		await spawnAndAwaitExit(["-c", "exit 0"]);
	}

	const converged = await waitFor(() => kqueueFdCount() <= initial);
	if (!converged) {
		assert.fail(
			`leaked ${kqueueFdCount() - initial} kqueue fds after 10 spawn/exit cycles (initial ${initial})`,
		);
	}
});

test("master fd is closed after the shell exits", async () => {
	const pty = spawnPty({
		meta: { shell: "/bin/sh", argv: ["-c", "exit 0"], cols: 80, rows: 24 },
	});
	const fd = pty.getMasterFd();
	assert.equal(fdIsOpen(fd), true, "master fd should be open while running");

	await new Promise<void>((resolve) => pty.onExit(() => resolve()));

	assert.equal(
		await waitFor(() => !fdIsOpen(fd)),
		true,
		"master fd must be closed once the session exits",
	);
});

// Kill-path integration tests with real PTYs and real process trees.
// Each scenario is an escape class the tree kill must close:
//
//   1. orphan-same-pgid  — descendant's parent exited; the orphan reparented
//      to pid 1 but kept the session leader's pgid. Must die on the first
//      volley via the recorded root pgid.
//   2. fork-during-escalation — HUP-trapping shell forks a new-pgid child
//      after the first volley. Must die because escalation re-snapshots
//      instead of replaying the stale target list.
//   3. tty-straggler — new-pgid child whose parent subshell exited before
//      the kill: not in the ppid tree, group never observed. Must die via
//      controlling-tty targeting.
//
// Runs under Node (`node --experimental-strip-types --test`): node-pty's
// native binding requires the Node ABI.

import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { after, describe, test } from "node:test";
import { spawn } from "../src/Pty/index.ts";
import type { SessionMeta } from "../src/protocol/index.ts";

interface PsRow {
	pid: number;
	ppid: number;
	pgid: number;
	tty: string;
	command: string;
}

const trackedPgids = new Set<number>();

function ps(): PsRow[] {
	const out = spawnSync("ps", ["-axo", "pid=,ppid=,pgid=,tty=,command="], {
		encoding: "utf8",
	}).stdout;
	return out
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => {
			const m = l.split(/\s+/);
			return {
				pid: Number(m[0]),
				ppid: Number(m[1]),
				pgid: Number(m[2]),
				tty: m[3] ?? "??",
				command: m.slice(4).join(" "),
			};
		})
		.filter((r) => Number.isInteger(r.pid) && r.pid > 0);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(
	label: string,
	fn: () => T | undefined,
	timeoutMs: number,
): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const value = fn();
		if (value !== undefined) return value;
		if (Date.now() > deadline) throw new Error(`timed out waiting: ${label}`);
		// 250ms: full-table ps polls at a tighter cadence destabilize the
		// other suites running in parallel with this one.
		await sleep(250);
	}
}

function spawnScript(script: string) {
	const meta: SessionMeta = {
		shell: "/bin/bash",
		argv: ["-c", script],
		cols: 80,
		rows: 24,
	};
	const pty = spawn({ meta });
	trackedPgids.add(pty.pid);
	const output: string[] = [];
	pty.onData((d) => output.push(d.toString("utf8")));
	return {
		pty,
		getOutput: () => output.join(""),
		waitForMarker: (marker: string, timeoutMs = 8000) =>
			waitFor(
				`marker ${marker}`,
				() => (output.join("").includes(marker) ? true : undefined),
				timeoutMs,
			),
	};
}

function isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === "EPERM";
	}
}

after(() => {
	// Belt and braces: nuke every group the tests created.
	for (const pgid of trackedPgids) {
		try {
			process.kill(-pgid, "SIGKILL");
		} catch {
			// already gone
		}
	}
	for (const row of ps()) {
		if (row.command.startsWith("sleep 3")) {
			// stray sleeper from a failed run — only ours use 300/333/344s
			if (["sleep 300", "sleep 333", "sleep 344"].includes(row.command)) {
				try {
					process.kill(row.pid, "SIGKILL");
				} catch {
					// already gone
				}
			}
		}
	}
});

describe("PTY tree kill", () => {
	test("kills an orphan that reparented to pid 1 but kept the root pgid", async () => {
		// The orphan ignores SIGHUP (SIG_IGN survives exec): the kernel's
		// foreground-group HUP on session-leader death does NOT reap it, so
		// only the escalation's pid-level SIGKILL via the recorded root pgid
		// can. A default-disposition orphan would die to the kernel HUP and
		// prove nothing.
		const { pty, waitForMarker } = spawnScript(
			"( bash -c 'trap \"\" HUP; exec sleep 300' & ); echo READY; exec sleep 344",
		);
		await waitForMarker("READY");
		const orphan = await waitFor(
			"orphan in root pgid",
			() =>
				ps().find(
					(r) =>
						r.command === "sleep 300" && r.pgid === pty.pid && r.ppid === 1,
				),
			8000,
		);

		pty.kill();

		await waitFor(
			"orphan killed",
			() => (isPidAlive(orphan.pid) ? undefined : true),
			8000,
		);
	});

	test("kills a new-pgid child forked after the first volley (re-snapshot)", async () => {
		// The HUP trap itself forks the escaper and echoes its pid, so it is
		// born after the first volley's snapshot by construction (the trap
		// runs on the volley's own SIGHUP) — only an escalation re-snapshot
		// can find it, through the still-alive shell's ppid link. bash blocks
		// in the `wait` builtin so the trap runs the instant the signal
		// lands, and the wait loop keeps bash alive afterwards: if the shell
		// exited, the session tty would dissolve and the new-pgid escaper
		// would join the untraceable daemonizer class no kill path can see.
		const { pty, waitForMarker, getOutput } = spawnScript(
			"set -m; trap 'sleep 333 & echo SPAWNED:$!' HUP; echo READY; sleep 500 & while :; do wait; done",
		);
		await waitForMarker("READY");

		pty.kill(); // the volley's own SIGHUP triggers the trap

		await waitForMarker("SPAWNED:", 5000);
		const match = /SPAWNED:(\d+)/.exec(getOutput());
		assert.ok(match?.[1], "setup: trap should echo the escaper pid");
		const escaperPid = Number(match[1]);

		// Escalation fires at ~1s and must re-snapshot to see this process.
		await waitFor(
			"escaper killed",
			() => (isPidAlive(escaperPid) ? undefined : true),
			8000,
		);
		await waitFor(
			"trapped shell killed",
			() => (isPidAlive(pty.pid) ? undefined : true),
			4000,
		);
	});

	test("kills a straggler findable only by controlling tty", async () => {
		const { pty, waitForMarker } = spawnScript(
			"set -m; ( sleep 300 & ); echo READY; exec sleep 344",
		);
		await waitForMarker("READY");
		const rootRow = await waitFor(
			"root row",
			() => ps().find((r) => r.pid === pty.pid),
			5000,
		);
		const straggler = await waitFor(
			"tty straggler",
			() =>
				ps().find(
					(r) =>
						r.command === "sleep 300" &&
						r.tty === rootRow.tty &&
						r.ppid === 1 &&
						r.pgid !== pty.pid,
				),
			8000,
		);
		trackedPgids.add(straggler.pgid);

		pty.kill();

		await waitFor(
			"straggler killed",
			() => (isPidAlive(straggler.pid) ? undefined : true),
			8000,
		);
	});
});

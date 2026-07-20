// Regression for #5792: an *adopted* session's input-write path silently
// wedges under kernel backpressure.
//
// AdoptedPty (a session inherited from a predecessor daemon across a Phase 2
// handoff) reads its PTY master fd through a `tty.ReadStream`. Constructing
// that stream flips the fd to non-blocking (O_NONBLOCK lives on the open file
// description, so it governs writes on the same fd too). The write path used
// `fs.writeSync` in a bare loop with no EAGAIN handling: once the kernel PTY
// input buffer (~64KB) fills — a foreground process that stops draining
// stdin, i.e. exactly the "≥1 day of accumulated sessions" profile in the
// report — `fs.writeSync` throws EAGAIN and the remaining input is dropped.
// Fresh sessions (NodePtyAdapter) are unaffected because node-pty buffers
// writes itself, which is why "spawn new terminals still works" while the
// long-lived adopted panes go input-dead.
//
// This test drives an AdoptedPty over a real fd whose non-blocking flip is
// real, floods it past the kernel buffer without draining, then drains and
// asserts every byte survived in order. It runs under Node, not Bun: the
// daemon ships on Node and Bun's `tty.ReadStream` does not reproduce the
// non-blocking fd handoff (see src/Pty/Pty.test.ts), so a bun-runtime version
// of this test cannot exercise the real failure.

import { strict as assert } from "node:assert";
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, test } from "node:test";
import { adoptFromFd, type Pty } from "../src/Pty/index.ts";

const FIFO_PATH = path.join(os.tmpdir(), `pty-daemon-bp-${process.pid}.fifo`);

const META = {
	shell: "/bin/sh",
	argv: [] as string[],
	cols: 80,
	rows: 24,
};

let openFd: number | null = null;
let pty: Pty | null = null;

after(() => {
	// Do NOT call pty.kill(): the stand-in pid is our own process, and the
	// TreeKiller would signal our process group. Just release the fd/fifo.
	try {
		if (pty) pty.pause();
	} catch {
		// ignore
	}
	try {
		if (openFd !== null) fs.closeSync(openFd);
	} catch {
		// tty.ReadStream may already own/have closed it
	}
	try {
		fs.unlinkSync(FIFO_PATH);
	} catch {
		// ignore
	}
});

test("adopted session buffers input past the kernel PTY buffer instead of dropping it", async () => {
	// A FIFO opened O_RDWR is a bidirectional, loopback stand-in for a PTY
	// master fd: writes land in the kernel buffer and can be read back from
	// the same fd, and it never hits EOF (there is always a writer — us).
	try {
		fs.unlinkSync(FIFO_PATH);
	} catch {
		// ignore
	}
	childProcess.execFileSync("mkfifo", [FIFO_PATH]);
	openFd = fs.openSync(FIFO_PATH, fs.constants.O_RDWR);

	// Use our own (alive) pid so the liveness poll never declares the session
	// exited; captureIdentity only *reads* the process table for it.
	pty = adoptFromFd({ fd: openFd, pid: process.pid, meta: META });

	// Flood far past the ~64KB kernel buffer while nothing is draining. The
	// reader is paused (no onData listener yet), so the buffer fills and stays
	// full — the exact backpressure that made the buggy fs.writeSync throw
	// EAGAIN and drop everything after the first ~64KB.
	const CHUNK = 64 * 1024;
	const CHUNKS = 8; // 512KB total, ~8x the kernel buffer
	const TOTAL = CHUNK * CHUNKS;
	const expected = Buffer.alloc(TOTAL);
	for (let i = 0; i < TOTAL; i++) expected[i] = i & 0xff;

	// The bug surfaces here: write() throws (EAGAIN via fs.writeSync) once the
	// kernel buffer is full. A correct, backpressure-aware write path buffers
	// the overflow and never throws.
	assert.doesNotThrow(() => {
		for (let i = 0; i < CHUNKS; i++) {
			pty?.write(expected.subarray(i * CHUNK, (i + 1) * CHUNK));
		}
	}, "adopted write must not throw under backpressure — input must be buffered, not dropped");

	// Now drain and prove nothing was lost: every byte we wrote must come back
	// in order.
	const received: Buffer[] = [];
	let receivedBytes = 0;
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(
				new Error(
					`timed out draining: got ${receivedBytes}/${TOTAL} bytes ` +
						`(input past the kernel buffer was dropped)`,
				),
			);
		}, 5_000);
		timer.unref();
		pty?.onData((chunk) => {
			received.push(chunk);
			receivedBytes += chunk.byteLength;
			if (receivedBytes >= TOTAL) {
				clearTimeout(timer);
				resolve();
			}
		});
	});

	const got = Buffer.concat(received).subarray(0, TOTAL);
	assert.equal(got.byteLength, TOTAL, "all written bytes must arrive");
	assert.ok(got.equals(expected), "bytes must arrive intact and in order");
});

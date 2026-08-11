// Real node-pty descriptor lifecycle coverage. Runs under Node because Bun's
// tty.ReadStream cannot safely own node-pty master descriptors.

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { test } from "node:test";
import { adoptFromFd, spawn } from "../src/Pty/index.ts";

const META = {
	shell: "/bin/sh",
	argv: ["-c", ":"],
	cols: 80,
	rows: 24,
};

function fdIsOpen(fd: number): boolean {
	try {
		fs.fstatSync(fd);
		return true;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "EBADF") return false;
		throw err;
	}
}

function waitForExit(pty: ReturnType<typeof spawn>): Promise<void> {
	return new Promise((resolve) => pty.onExit(() => resolve()));
}

function processPtmxCount(): number | null {
	if (process.platform !== "darwin") return null;
	const output = execFileSync("lsof", ["-nP", "-p", String(process.pid)], {
		encoding: "utf8",
	});
	return output.split("\n").filter((line) => /\/dev\/ptmx$/.test(line)).length;
}

test("real PTY masters close across high natural-exit churn", async () => {
	const processMastersBefore = processPtmxCount();
	for (let i = 0; i < 128; i++) {
		const pty = spawn({ meta: META });
		const fd = pty.getMasterFd();
		assert.equal(fdIsOpen(fd), true, `cycle ${i}: master should start open`);
		await waitForExit(pty);
		assert.equal(fdIsOpen(fd), false, `cycle ${i}: master fd ${fd} leaked`);
		pty.dispose();
		pty.dispose();
	}
	const processMastersAfter = processPtmxCount();
	assert.equal(
		processMastersAfter,
		processMastersBefore,
		"node-pty must not retain hidden /dev/ptmx descriptors outside term._fd",
	);
});

test("native and adopted disposal are idempotent on real fds", async () => {
	const native = spawn({
		meta: { ...META, argv: ["-c", "sleep 30"] },
	});
	const nativeExit = waitForExit(native);
	const nativeFd = native.getMasterFd();
	const adoptedFd = fs.openSync(`/dev/fd/${nativeFd}`, "r+");
	const adopted = adoptFromFd({
		fd: adoptedFd,
		pid: native.pid,
		meta: native.meta,
	});

	try {
		adopted.dispose();
		adopted.dispose();
		assert.equal(
			fdIsOpen(adoptedFd),
			false,
			"adopted master copy should close",
		);

		native.kill("SIGKILL");
		native.dispose();
		native.dispose();
		assert.equal(fdIsOpen(nativeFd), false, "native master should close");
		await nativeExit;
	} finally {
		adopted.dispose();
		try {
			native.kill("SIGKILL");
		} catch {
			// already exited
		}
		native.dispose();
	}
});

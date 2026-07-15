// Compatibility regression for the first upgrade from a one-phase predecessor.
// A legacy parent waits for `upgrade-ack` and then commits only by disconnecting
// IPC; it never sends --handoff-socket or an explicit upgrade-commit frame.

import { strict as assert } from "node:assert";
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { HandoffMessage } from "../src/protocol/index.ts";
import { SNAPSHOT_VERSION, writeSnapshot } from "../src/SessionStore/index.ts";
import { connectAndHello } from "./helpers/client.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const DAEMON_SCRIPT = path.resolve(here, "..", "src", "main.ts");

function unlinkSafe(filePath: string): void {
	try {
		fs.unlinkSync(filePath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
}

function waitForLegacyAck(
	child: childProcess.ChildProcess,
	timeoutMs = 5_000,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error("legacy upgrade-ack timed out")),
			timeoutMs,
		);
		const onMessage = (raw: unknown) => {
			const message = raw as Partial<HandoffMessage>;
			if (message.type !== "upgrade-ack") return;
			clearTimeout(timer);
			child.off("message", onMessage);
			resolve();
		};
		child.on("message", onMessage);
		child.once("exit", (code, signal) => {
			clearTimeout(timer);
			reject(
				new Error(
					`legacy successor exited before ACK (code=${code}, signal=${signal})`,
				),
			);
		});
	});
}

async function connectWithRetry(
	socketPath: string,
	timeoutMs = 5_000,
): Promise<Awaited<ReturnType<typeof connectAndHello>>> {
	const deadline = Date.now() + timeoutMs;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			return await connectAndHello(socketPath);
		} catch (error) {
			lastError = error;
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
	}
	throw lastError ?? new Error("legacy successor socket did not become ready");
}

test("legacy ACK plus IPC disconnect publishes a healthy successor", async () => {
	const nonce = `${process.pid}-${Math.random().toString(36).slice(2)}`;
	const socketPath = path.join(os.tmpdir(), `pty-daemon-legacy-${nonce}.sock`);
	const snapshotPath = path.join(
		os.tmpdir(),
		`pty-daemon-legacy-${nonce}.snap`,
	);
	writeSnapshot(snapshotPath, {
		version: SNAPSHOT_VERSION,
		writtenAt: Date.now(),
		sessions: [],
	});

	let stderr = "";
	const successor = childProcess.spawn(
		process.execPath,
		[
			...process.execArgv,
			DAEMON_SCRIPT,
			"--handoff",
			`--snapshot=${snapshotPath}`,
			`--socket=${socketPath}`,
		],
		{ stdio: ["ignore", "ignore", "pipe", "ipc"] },
	);
	successor.stderr?.on("data", (chunk) => {
		stderr += Buffer.from(chunk).toString("utf8");
	});

	let client: Awaited<ReturnType<typeof connectAndHello>> | null = null;
	try {
		await waitForLegacyAck(successor);
		assert.equal(successor.connected, true);
		successor.disconnect();

		// IPC is intentionally gone before the successor sends LISTENING. The
		// published socket remains authoritative and the send failure is harmless.
		client = await connectWithRetry(socketPath);
		client.send({ type: "list" });
		const list = await client.waitFor(
			(message) => message.type === "list-reply",
		);
		assert.equal(list.type, "list-reply");
		if (list.type === "list-reply") assert.deepEqual(list.sessions, []);
		assert.equal(successor.exitCode, null, stderr);
	} finally {
		await client?.close();
		if (successor.exitCode === null) successor.kill("SIGTERM");
		await new Promise<void>((resolve) => {
			if (successor.exitCode !== null) return resolve();
			successor.once("exit", () => resolve());
			setTimeout(resolve, 1_000).unref();
		});
		unlinkSafe(socketPath);
		unlinkSafe(snapshotPath);
	}
});

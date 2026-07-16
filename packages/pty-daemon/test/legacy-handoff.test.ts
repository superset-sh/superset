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
import { DAEMON_PACKAGE_VERSION } from "../src/index.ts";
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
		const hello = client.messages.find(
			(message) => message.type === "hello-ack",
		);
		assert.equal(hello?.type, "hello-ack");
		if (hello?.type === "hello-ack") {
			assert.equal(hello.daemonVersion, DAEMON_PACKAGE_VERSION);
		}
		assert.notEqual(
			DAEMON_PACKAGE_VERSION,
			"0.2.5",
			"the first live upgrade must advertise a version newer than 1.15.0's daemon",
		);

		// The legacy 0.2.5 predecessor never sees this additive v2 op. It is sent
		// only after reconnecting to the current successor and must acknowledge the
		// explicit staged-reader release used by the new host.
		const activatedPromise = client.waitForNext(
			(message) => message.type === "adopted-activated",
		);
		client.send({ type: "activate-adopted" });
		const activated = await activatedPromise;
		assert.equal(activated.type, "adopted-activated");
		if (activated.type === "adopted-activated") {
			assert.equal(activated.count, 0);
		}

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

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
import {
	accumulatedOutputAsString,
	connectAndHello,
} from "./helpers/client.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const DAEMON_SCRIPT = path.resolve(here, "..", "src", "main.ts");
const LEGACY_DAEMON_BUNDLE = path.resolve(
	here,
	"fixtures",
	"pty-daemon-0.2.5.mjs",
);

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

function buildCurrentDaemonBundle(outputPath: string): void {
	const result = childProcess.spawnSync(
		"bun",
		[
			"build",
			DAEMON_SCRIPT,
			"--target=node",
			"--format=esm",
			"--external=node-pty",
			`--outfile=${outputPath}`,
		],
		{
			cwd: path.resolve(here, ".."),
			encoding: "utf8",
		},
	);
	assert.equal(
		result.status,
		0,
		`current daemon bundle failed: ${result.stderr || result.stdout}`,
	);
}

async function waitForExit(
	child: childProcess.ChildProcess,
	timeoutMs = 10_000,
): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) return;
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			child.off("exit", onExit);
			reject(new Error(`process ${child.pid ?? "unknown"} did not exit`));
		}, timeoutMs);
		const onExit = () => {
			clearTimeout(timer);
			resolve();
		};
		child.once("exit", onExit);
	});
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

test("real 0.2.5 predecessor hands a live PTY to the 0.2.6 bundle", async () => {
	assert.equal(
		DAEMON_PACKAGE_VERSION,
		"0.2.6",
		"this compatibility boundary must move deliberately when the daemon version changes",
	);
	const nonce = `${process.pid}-${Math.random().toString(36).slice(2)}`;
	const runtimeDir = path.join(here, `.legacy-runtime-${nonce}`);
	const runtimeScript = path.join(runtimeDir, "pty-daemon.mjs");
	const currentBundle = path.join(runtimeDir, "pty-daemon-current.mjs");
	const socketPath = path.join(
		os.tmpdir(),
		`pty-daemon-cross-version-${nonce}.sock`,
	);
	fs.mkdirSync(runtimeDir, { recursive: true });
	buildCurrentDaemonBundle(currentBundle);
	fs.copyFileSync(LEGACY_DAEMON_BUNDLE, runtimeScript);
	fs.chmodSync(runtimeScript, 0o755);

	let stderr = "";
	const predecessor = childProcess.spawn(
		process.execPath,
		[...process.execArgv, runtimeScript, `--socket=${socketPath}`],
		{ stdio: ["ignore", "ignore", "pipe"] },
	);
	predecessor.stderr?.on("data", (chunk) => {
		stderr += Buffer.from(chunk).toString("utf8");
	});

	let predecessorClient: Awaited<ReturnType<typeof connectAndHello>> | null =
		null;
	let successorClient: Awaited<ReturnType<typeof connectAndHello>> | null =
		null;
	let successorPid: number | null = null;
	try {
		predecessorClient = await connectWithRetry(socketPath);
		const predecessorConnection = predecessorClient;
		const predecessorHello = predecessorConnection.messages.find(
			(message) => message.type === "hello-ack",
		);
		assert.equal(predecessorHello?.type, "hello-ack");
		if (predecessorHello?.type === "hello-ack") {
			assert.equal(predecessorHello.daemonVersion, "0.2.5");
		}

		const sessionId = `legacy-live-${nonce}`;
		predecessorConnection.send({
			type: "open",
			id: sessionId,
			meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
		});
		const opened = await predecessorConnection.waitFor(
			(message) => message.type === "open-ok" && message.id === sessionId,
		);
		assert.equal(opened.type, "open-ok");
		if (opened.type !== "open-ok") return;
		const originalShellPid = opened.pid;

		predecessorConnection.send({
			type: "subscribe",
			id: sessionId,
			replay: false,
		});
		const beforeMarker = `cross-version-before-${nonce}`;
		predecessorConnection.send(
			{ type: "input", id: sessionId },
			Buffer.from(`printf '${beforeMarker}\\n'\n`),
		);
		await predecessorConnection.waitFor(
			(message) =>
				message.type === "output" &&
				message.id === sessionId &&
				accumulatedOutputAsString(predecessorConnection, sessionId).includes(
					beforeMarker,
				),
			5_000,
		);

		// The running 0.2.5 process keeps its loaded code, while its self-spawn
		// path now resolves to the freshly built 0.2.6 artifact.
		fs.renameSync(currentBundle, runtimeScript);
		predecessorConnection.send({ type: "prepare-upgrade" });
		const prepared = await predecessorConnection.waitFor(
			(message) => message.type === "upgrade-prepared",
			10_000,
		);
		assert.equal(prepared.type, "upgrade-prepared");
		if (prepared.type !== "upgrade-prepared") return;
		assert.equal(prepared.result.ok, true, JSON.stringify(prepared.result));
		if (!prepared.result.ok) return;
		successorPid = prepared.result.successorPid;
		await waitForExit(predecessor);

		successorClient = await connectWithRetry(socketPath);
		const successorConnection = successorClient;
		const successorHello = successorConnection.messages.find(
			(message) => message.type === "hello-ack",
		);
		assert.equal(successorHello?.type, "hello-ack");
		if (successorHello?.type === "hello-ack") {
			assert.equal(successorHello.daemonVersion, "0.2.6");
			assert.equal(successorHello.daemonPid, successorPid);
		}

		successorConnection.send({
			type: "subscribe",
			id: sessionId,
			replay: true,
		});
		await successorConnection.waitFor(
			(message) =>
				message.type === "output" &&
				message.id === sessionId &&
				accumulatedOutputAsString(successorConnection, sessionId).includes(
					beforeMarker,
				),
			5_000,
		);
		const activated = successorConnection.waitForNext(
			(message) => message.type === "adopted-activated",
		);
		successorConnection.send({ type: "activate-adopted" });
		await activated;

		successorConnection.send({ type: "list" });
		const listed = await successorConnection.waitFor(
			(message) => message.type === "list-reply",
		);
		assert.equal(listed.type, "list-reply");
		if (listed.type === "list-reply") {
			const session = listed.sessions.find(
				(candidate) => candidate.id === sessionId,
			);
			assert.ok(session, JSON.stringify(listed.sessions));
			assert.equal(session.pid, originalShellPid);
			assert.equal(session.alive, true);
		}

		const afterMarker = `cross-version-after-${nonce}`;
		successorConnection.send(
			{ type: "input", id: sessionId },
			Buffer.from(`printf '${afterMarker}\\n'\n`),
		);
		await successorConnection.waitFor(
			(message) =>
				message.type === "output" &&
				message.id === sessionId &&
				accumulatedOutputAsString(successorConnection, sessionId).includes(
					afterMarker,
				),
			5_000,
		);
	} finally {
		await predecessorClient?.close();
		await successorClient?.close();
		if (predecessor.exitCode === null) predecessor.kill("SIGTERM");
		if (successorPid) {
			try {
				process.kill(successorPid, "SIGTERM");
			} catch {
				// Already exited after a failing assertion.
			}
		}
		await waitForExit(predecessor, 2_000).catch(() => {});
		unlinkSafe(socketPath);
		fs.rmSync(runtimeDir, { recursive: true, force: true });
		assert.doesNotMatch(stderr, /fatal:/i, stderr);
	}
});

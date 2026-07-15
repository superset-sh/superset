// Regression coverage for adopted PTYs whose slave stops reading input.
// Runs under Node (`node --experimental-strip-types --test`).

import { strict as assert } from "node:assert";
import * as childProcess from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	accumulatedOutputAsString,
	connectAndHello,
	type DaemonClient,
} from "./helpers/client.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const DAEMON_SCRIPT = path.resolve(here, "..", "src", "main.ts");
const HANDOFF_NAK_FIXTURE = path.resolve(
	here,
	"fixtures",
	"handoff-nak-before-adopt.ts",
);
const sockPath = path.join(
	os.tmpdir(),
	`pty-daemon-handoff-backpressure-${process.pid}.sock`,
);

let daemonA: childProcess.ChildProcess | null = null;
let successorPid: number | null = null;
const sessionPids = new Set<number>();

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

function isExternalFdNonBlocking(pid: number, fd: number): boolean {
	if (process.platform === "linux") {
		const info = fs.readFileSync(`/proc/${pid}/fdinfo/${fd}`, "utf8");
		const flags = /^flags:\s+([0-7]+)/m.exec(info)?.[1];
		return Boolean(flags && (Number.parseInt(flags, 8) & 0o4000) !== 0);
	}
	if (process.platform === "darwin") {
		const probe = childProcess.spawnSync(
			"/usr/sbin/lsof",
			["+fg", "-a", "-p", String(pid), "-d", String(fd)],
			{ encoding: "utf8" },
		);
		return probe.status === 0 && /(?:^|[,;])NB(?:[,;\s]|$)/m.test(probe.stdout);
	}
	return true;
}

async function waitForSocket(p: string, timeoutMs = 3_000): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			fs.statSync(p);
			return;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
	}
	throw new Error(`socket ${p} not ready in ${timeoutMs}ms`);
}

async function reconnectToSuccessor(timeoutMs = 5_000): Promise<DaemonClient> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			return await connectAndHello(sockPath);
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
	}
	throw new Error(`successor did not accept connections within ${timeoutMs}ms`);
}

function killBestEffort(pid: number | null): void {
	if (!pid) return;
	for (const target of [-pid, pid]) {
		try {
			process.kill(target, "SIGKILL");
		} catch {
			// Already exited or not a process-group leader.
		}
	}
}

before(async () => {
	unlinkSafe(sockPath);
	daemonA = spawnDaemon(sockPath);
	await waitForSocket(sockPath);
});

after(() => {
	for (const pid of sessionPids) killBestEffort(pid);
	killBestEffort(successorPid);
	if (daemonA?.pid) killBestEffort(daemonA.pid);
	unlinkSafe(sockPath);
});

test("four backpressured adopted PTYs do not exhaust workers or block control", async () => {
	const blockedIds = Array.from(
		{ length: 4 },
		(_, index) => `adopted-blocked-reader-${index + 1}`,
	);
	const healthyId = "adopted-healthy";
	const inputBytes = 1024 * 1024;
	const chunkBytes = 64 * 1024;
	const readerScript = [
		"import hashlib, os, termios, tty",
		"tty.setraw(0, termios.TCSANOW)",
		"os.write(1, b'blocked-reader-ready\\n')",
		`remaining = ${inputBytes}`,
		"total = 0",
		"digest = hashlib.sha256()",
		"while remaining:",
		"    data = os.read(0, min(65536, remaining))",
		"    if not data:",
		"        break",
		"    digest.update(data)",
		"    total += len(data)",
		"    remaining -= len(data)",
		"os.write(1, f'blocked-reader-received:{total}:{digest.hexdigest()}\\n'.encode())",
	].join("\n");
	const predecessorClient = await connectAndHello(sockPath);
	const blockedSessions: Array<{ id: string; pid: number }> = [];
	let successorClient: DaemonClient | null = null;
	let controlClient: DaemonClient | null = null;

	try {
		for (const blockedId of blockedIds) {
			predecessorClient.send({
				type: "open",
				id: blockedId,
				meta: {
					shell: "/usr/bin/python3",
					argv: ["-c", readerScript],
					cols: 80,
					rows: 24,
				},
			});
			const opened = await predecessorClient.waitFor(
				(message) => message.type === "open-ok" && message.id === blockedId,
			);
			assert.equal(opened.type, "open-ok");
			if (opened.type !== "open-ok") continue;
			blockedSessions.push({ id: blockedId, pid: opened.pid });
			sessionPids.add(opened.pid);
			predecessorClient.send({
				type: "subscribe",
				id: blockedId,
				replay: false,
			});
			await predecessorClient.waitFor(
				(message) =>
					message.type === "output" &&
					message.id === blockedId &&
					accumulatedOutputAsString(predecessorClient, blockedId).includes(
						"blocked-reader-ready",
					),
			);
		}
		assert.equal(blockedSessions.length, blockedIds.length);

		predecessorClient.send({
			type: "open",
			id: healthyId,
			meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
		});
		const healthyOpened = await predecessorClient.waitFor(
			(message) => message.type === "open-ok" && message.id === healthyId,
		);
		assert.equal(healthyOpened.type, "open-ok");
		if (healthyOpened.type === "open-ok") sessionPids.add(healthyOpened.pid);

		predecessorClient.send({ type: "prepare-upgrade" });
		const upgrade = await predecessorClient.waitFor(
			(message) => message.type === "upgrade-prepared",
			10_000,
		);
		assert.equal(upgrade.type, "upgrade-prepared");
		if (upgrade.type !== "upgrade-prepared") return;
		assert.equal(upgrade.result.ok, true, JSON.stringify(upgrade.result));
		if (!upgrade.result.ok) return;
		successorPid = upgrade.result.successorPid;

		await new Promise<void>((resolve) => {
			if (!daemonA || daemonA.exitCode !== null) return resolve();
			daemonA.once("exit", () => resolve());
		});
		successorClient = await reconnectToSuccessor();
		controlClient = await connectAndHello(sockPath);
		const adoptedClient = successorClient;
		const otherClient = controlClient;

		// Stop four adopted children after they have switched their slaves to raw
		// mode. Blocking fds would pin all four default libuv workers. Nonblocking
		// adopted fds must leave both the control plane and a fifth PTY responsive.
		for (const session of blockedSessions) {
			process.kill(session.pid, "SIGSTOP");
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
		const expectedHash = createHash("sha256");
		for (let offset = 0; offset < inputBytes; offset += chunkBytes) {
			const chunk = Buffer.alloc(chunkBytes, (offset / chunkBytes) & 0xff);
			expectedHash.update(chunk);
		}
		const expectedDigest = expectedHash.digest("hex");
		for (const session of blockedSessions) {
			adoptedClient.send({ type: "subscribe", id: session.id, replay: false });
			for (let offset = 0; offset < inputBytes; offset += chunkBytes) {
				const chunk = Buffer.alloc(chunkBytes, (offset / chunkBytes) & 0xff);
				adoptedClient.send({ type: "input", id: session.id }, chunk);
			}
		}

		// This list shares the input socket, so wire ordering proves every input
		// frame was dispatched before the daemon handles the list request.
		const orderedListPromise = adoptedClient.waitForNext(
			(message) => message.type === "list-reply",
			1_000,
		);
		adoptedClient.send({ type: "list" });
		await orderedListPromise;

		const listReplyPromise = otherClient.waitForNext(
			(message) => message.type === "list-reply",
			1_000,
		);
		otherClient.send({ type: "list" });
		const listReply = await listReplyPromise;
		assert.equal(listReply.type, "list-reply");
		if (listReply.type === "list-reply") {
			assert.deepEqual(
				new Set(listReply.sessions.map((session) => session.id)),
				new Set([...blockedIds, healthyId]),
			);
		}
		otherClient.send({ type: "subscribe", id: healthyId, replay: false });
		otherClient.send(
			{ type: "input", id: healthyId },
			Buffer.from("printf 'healthy-still-responsive\\n'\n"),
		);
		await otherClient.waitFor(
			(message) =>
				message.type === "output" &&
				message.id === healthyId &&
				accumulatedOutputAsString(otherClient, healthyId).includes(
					"healthy-still-responsive",
				),
			1_000,
		);

		for (const session of blockedSessions) {
			process.kill(session.pid, "SIGCONT");
		}
		for (const session of blockedSessions) {
			await adoptedClient.waitFor(
				(message) =>
					message.type === "output" &&
					message.id === session.id &&
					accumulatedOutputAsString(adoptedClient, session.id).includes(
						`blocked-reader-received:${inputBytes}:${expectedDigest}`,
					),
				15_000,
			);
		}

		const healthyClosedPromise = otherClient.waitForNext(
			(message) => message.type === "closed" && message.id === healthyId,
			2_000,
		);
		otherClient.send({ type: "close", id: healthyId, signal: "SIGKILL" });
		await healthyClosedPromise;
	} finally {
		await Promise.all([
			predecessorClient.close(),
			successorClient?.close(),
			controlClient?.close(),
		]);
	}
});

test("a child NAK before adopt restores the predecessor fd before input resumes", async () => {
	const abortSockPath = path.join(
		os.tmpdir(),
		`pty-daemon-handoff-abort-${process.pid}.sock`,
	);
	unlinkSafe(abortSockPath);
	let stderr = "";
	const predecessor = childProcess.spawn(
		process.execPath,
		[...process.execArgv, HANDOFF_NAK_FIXTURE, `--socket=${abortSockPath}`],
		{ stdio: ["ignore", "inherit", "pipe"] },
	);
	predecessor.stderr?.on("data", (chunk) => {
		stderr += chunk.toString("utf8");
	});
	let client: DaemonClient | null = null;
	let shellPid: number | null = null;

	try {
		await waitForSocket(abortSockPath);
		client = await connectAndHello(abortSockPath);
		const id = "failed-handoff-survivor";
		client.send({
			type: "open",
			id,
			meta: { shell: "/bin/sh", argv: [], cols: 80, rows: 24 },
		});
		const opened = await client.waitFor(
			(message) => message.type === "open-ok" && message.id === id,
		);
		assert.equal(opened.type, "open-ok");
		if (opened.type !== "open-ok") return;
		shellPid = opened.pid;
		client.send({ type: "subscribe", id, replay: false });

		client.send({ type: "prepare-upgrade" });
		const aborted = await client.waitFor(
			(message) => message.type === "upgrade-prepared",
			5_000,
		);
		assert.equal(aborted.type, "upgrade-prepared");
		if (aborted.type !== "upgrade-prepared") return;
		assert.equal(aborted.result.ok, false);
		assert.match(
			aborted.result.ok ? "" : aborted.result.reason,
			/intentional test NAK/,
		);

		const inheritedFd = /ptyFds=(\d+)/.exec(stderr)?.[1];
		assert.ok(inheritedFd, `missing inherited fd in daemon log:\n${stderr}`);
		assert.equal(
			isExternalFdNonBlocking(predecessor.pid ?? -1, Number(inheritedFd)),
			true,
			`predecessor fd stayed blocking after child NAK:\n${stderr}`,
		);

		const marker = "predecessor-responsive-after-handoff-nak";
		client.send({ type: "input", id }, Buffer.from(`printf '${marker}\\n'\n`));
		await client.waitFor(
			(message) =>
				message.type === "output" &&
				message.id === id &&
				accumulatedOutputAsString(client as DaemonClient, id).includes(marker),
			1_000,
		);
		const listPromise = client.waitForNext(
			(message) => message.type === "list-reply",
			1_000,
		);
		client.send({ type: "list" });
		const list = await listPromise;
		assert.equal(list.type, "list-reply");
		if (list.type === "list-reply") {
			assert.equal(
				list.sessions.some((session) => session.id === id),
				true,
			);
		}
	} finally {
		await client?.close();
		killBestEffort(shellPid);
		killBestEffort(predecessor.pid ?? null);
		unlinkSafe(abortSockPath);
	}
});

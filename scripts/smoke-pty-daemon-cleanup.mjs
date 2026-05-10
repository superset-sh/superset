#!/usr/bin/env node
/**
 * Smoke test for stale PTY child processes.
 *
 * Usage:
 *   node scripts/smoke-pty-daemon-cleanup.mjs [repo-root]
 *
 * The script starts the target worktree's real pty-daemon under Node, opens a
 * bash PTY that backgrounds a generic long-running helper in its own process
 * group, closes the daemon session, and fails if the helper survives.
 */

import { spawn, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const HEADER_BYTES = 4;
const INNER_JSON_LEN_BYTES = 4;
const MAX_FRAME_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;

function parseArgs(rawArgs) {
	const parsed = {
		production: false,
		repoRoot: undefined,
		socketPath: undefined,
		orgId: undefined,
	};
	for (let i = 0; i < rawArgs.length; i += 1) {
		const arg = rawArgs[i];
		if (arg === "--help" || arg === "-h") {
			printUsageAndExit();
		}
		if (arg === "--production" || arg === "--prod") {
			parsed.production = true;
			continue;
		}
		if (arg === "--socket") {
			parsed.socketPath = rawArgs[i + 1];
			parsed.production = true;
			i += 1;
			continue;
		}
		if (arg?.startsWith("--socket=")) {
			parsed.socketPath = arg.slice("--socket=".length);
			parsed.production = true;
			continue;
		}
		if (arg === "--org" || arg === "--organization") {
			parsed.orgId = rawArgs[i + 1];
			parsed.production = true;
			i += 1;
			continue;
		}
		if (arg?.startsWith("--org=")) {
			parsed.orgId = arg.slice("--org=".length);
			parsed.production = true;
			continue;
		}
		if (arg === "--repo" || arg === "--repo-root") {
			parsed.repoRoot = rawArgs[i + 1];
			i += 1;
			continue;
		}
		if (arg?.startsWith("--repo=")) {
			parsed.repoRoot = arg.slice("--repo=".length);
			continue;
		}
		if (!arg?.startsWith("-") && parsed.repoRoot === undefined) {
			parsed.repoRoot = arg;
			continue;
		}
		throw new Error(`unknown argument: ${arg}`);
	}
	return parsed;
}

function printUsageAndExit() {
	console.log(`Usage:
  node scripts/smoke-pty-daemon-cleanup.mjs [repo-root]
  node scripts/smoke-pty-daemon-cleanup.mjs --repo /path/to/worktree
  node scripts/smoke-pty-daemon-cleanup.mjs --production
  node scripts/smoke-pty-daemon-cleanup.mjs --production --org <organizationId>
  node scripts/smoke-pty-daemon-cleanup.mjs --socket /path/to/pty-daemon.sock`);
	process.exit(0);
}

class PtyDaemonClient {
	static async connect(socketPath) {
		const socket = await new Promise((resolve, reject) => {
			const sock = net.createConnection({ path: socketPath });
			const timer = setTimeout(() => {
				sock.destroy();
				reject(new Error("connect timed out"));
			}, DEFAULT_TIMEOUT_MS);
			sock.once("connect", () => {
				clearTimeout(timer);
				resolve(sock);
			});
			sock.once("error", (error) => {
				clearTimeout(timer);
				reject(error);
			});
		});

		const client = new PtyDaemonClient(socket);
		const ack = await client.request({
			type: "hello",
			protocols: [2, 1],
			clientVersion: "cleanup-smoke",
		});
		if (ack.type !== "hello-ack") {
			throw new Error(`handshake failed: ${JSON.stringify(ack)}`);
		}
		client.protocol = ack.protocol;
		client.daemonVersion = ack.daemonVersion;
		return client;
	}

	constructor(socket) {
		this.socket = socket;
		this.buffer = Buffer.alloc(0);
		this.waiters = [];
		this.protocol = null;
		this.daemonVersion = "";
		socket.on("data", (chunk) => this.onData(chunk));
		socket.on("close", () => this.rejectAll(new Error("socket closed")));
		socket.on("error", (error) => this.rejectAll(error));
	}

	request(message) {
		this.socket.write(encodeFrame(message));
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.waiters = this.waiters.filter((entry) => entry !== waiter);
				reject(new Error(`timed out waiting for ${message.type}`));
			}, DEFAULT_TIMEOUT_MS);
			const waiter = {
				resolve: (frame) => {
					clearTimeout(timer);
					resolve(frame.message);
				},
				reject: (error) => {
					clearTimeout(timer);
					reject(error);
				},
			};
			this.waiters.push(waiter);
		});
	}

	async dispose() {
		if (this.socket.destroyed) return;
		await new Promise((resolve) => {
			this.socket.end(() => resolve());
			setTimeout(() => {
				if (!this.socket.destroyed) this.socket.destroy();
				resolve();
			}, 200);
		});
	}

	onData(chunk) {
		this.buffer =
			this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
		for (const frame of drainFrames(this)) {
			const waiter = this.waiters.shift();
			if (waiter) waiter.resolve(frame);
		}
	}

	rejectAll(error) {
		const waiters = this.waiters.splice(0);
		for (const waiter of waiters) {
			waiter.reject(error);
		}
	}
}

function encodeFrame(message, payload) {
	const jsonBytes = Buffer.from(JSON.stringify(message), "utf8");
	const payloadLen = payload?.byteLength ?? 0;
	const totalLen = INNER_JSON_LEN_BYTES + jsonBytes.byteLength + payloadLen;
	const out = Buffer.alloc(HEADER_BYTES + totalLen);
	out.writeUInt32BE(totalLen, 0);
	out.writeUInt32BE(jsonBytes.byteLength, HEADER_BYTES);
	jsonBytes.copy(out, HEADER_BYTES + INNER_JSON_LEN_BYTES);
	if (payloadLen > 0) {
		out.set(
			payload,
			HEADER_BYTES + INNER_JSON_LEN_BYTES + jsonBytes.byteLength,
		);
	}
	return out;
}

function drainFrames(client) {
	const frames = [];
	while (client.buffer.length >= HEADER_BYTES) {
		const totalLen = client.buffer.readUInt32BE(0);
		if (totalLen > MAX_FRAME_BYTES) {
			throw new Error(`frame too large: ${totalLen}`);
		}
		if (totalLen < INNER_JSON_LEN_BYTES) {
			throw new Error(`frame too small: ${totalLen}`);
		}
		if (client.buffer.length < HEADER_BYTES + totalLen) break;

		const jsonLen = client.buffer.readUInt32BE(HEADER_BYTES);
		if (jsonLen > totalLen - INNER_JSON_LEN_BYTES) {
			throw new Error(`invalid json length: ${jsonLen}`);
		}

		const jsonStart = HEADER_BYTES + INNER_JSON_LEN_BYTES;
		const payloadStart = jsonStart + jsonLen;
		const frameEnd = HEADER_BYTES + totalLen;
		const message = JSON.parse(
			client.buffer.subarray(jsonStart, payloadStart).toString("utf8"),
		);
		const payload =
			payloadStart < frameEnd
				? client.buffer.subarray(payloadStart, frameEnd)
				: null;
		frames.push({ message, payload });
		client.buffer = client.buffer.subarray(frameEnd);
	}
	return frames;
}

async function waitFor(predicate, timeoutMs, message) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (predicate()) return true;
		await sleep(25);
	}
	if (message) throw new Error(message());
	return false;
}

async function stopProcess(child) {
	if (!child || child.exitCode !== null || child.signalCode !== null) return;
	child.kill("SIGTERM");
	if (await waitForProcessExit(child, 1000)) return;
	child.kill("SIGKILL");
	await waitForProcessExit(child, 1000);
}

function waitForProcessExit(child, timeoutMs) {
	if (child.exitCode !== null || child.signalCode !== null) return true;
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			child.off("exit", onExit);
			resolve(false);
		}, timeoutMs);
		const onExit = () => {
			clearTimeout(timer);
			resolve(true);
		};
		child.once("exit", onExit);
	});
}

function fileExists(filePath) {
	return existsSync(filePath);
}

function isPidAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error?.code === "EPERM";
	}
}

function readPositivePidFile(filePath) {
	if (!existsSync(filePath)) return null;
	const raw = readFileSync(filePath, "utf8").trim();
	if (!/^\d+$/.test(raw)) return null;
	const pid = Number(raw);
	return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function killPid(pid, signal) {
	try {
		process.kill(pid, signal);
	} catch {
		// Already gone.
	}
}

function processRow(pid) {
	const result = spawnSync(
		"ps",
		["-p", String(pid), "-o", "pid=,ppid=,pgid=,tty=,stat=,command="],
		{ encoding: "utf8" },
	);
	const row = result.stdout.trim();
	return row.length > 0 ? row : null;
}

function shellQuote(value) {
	return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function stringEnv(env) {
	const out = {};
	for (const [key, value] of Object.entries(env)) {
		if (typeof value === "string") out[key] = value;
	}
	return out;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const tmpDir = mkdtempSync(path.join(os.tmpdir(), "superset-pty-cleanup-"));
	const launchedSocketPath = path.join(tmpDir, "pty-daemon.sock");
	const helperPidPath = path.join(tmpDir, "detached-helper.pid");
	const sessionId = `cleanup-smoke-${process.pid}-${Date.now()}`;

	let repoRoot = null;
	let daemonProcess = null;
	let daemonStderr = "";
	let client = null;
	let helperPid = null;

	try {
		let socketPath;
		if (args.production || args.socketPath) {
			const target = args.socketPath
				? {
						socketPath: path.resolve(args.socketPath),
						pid: null,
						organizationId: "manual-socket",
						startedAt: null,
					}
				: await findProductionDaemon(args.orgId);
			socketPath = target.socketPath;
			repoRoot = process.cwd();
			console.log("[smoke] mode: production");
			console.log(`[smoke] organization: ${target.organizationId}`);
			console.log(`[smoke] daemon pid: ${target.pid ?? "(manual socket)"}`);
			console.log(`[smoke] socket: ${socketPath}`);
		} else {
			repoRoot = path.resolve(args.repoRoot ?? process.cwd());
			const daemonEntry = path.join(
				repoRoot,
				"packages/pty-daemon/src/main.ts",
			);
			socketPath = launchedSocketPath;
			console.log("[smoke] mode: source");
			console.log(`[smoke] repo: ${repoRoot}`);
			console.log(`[smoke] daemon: ${daemonEntry}`);

			daemonProcess = spawn(
				"node",
				["--experimental-strip-types", daemonEntry, `--socket=${socketPath}`],
				{
					cwd: repoRoot,
					stdio: ["ignore", "ignore", "pipe"],
					env: {
						...process.env,
						SUPERSET_PTY_DAEMON_VERSION: "cleanup-smoke",
					},
				},
			);
			daemonProcess.stderr?.on("data", (chunk) => {
				daemonStderr += chunk.toString();
			});

			await waitFor(
				() => fileExists(socketPath),
				DEFAULT_TIMEOUT_MS,
				() => `daemon did not create socket\n${daemonStderr}`,
			);
		}

		client = await PtyDaemonClient.connect(socketPath);
		console.log(
			`[smoke] connected: protocol=${client.protocol} daemon=${client.daemonVersion}`,
		);

		const script = [
			"set -m",
			`${shellQuote(process.execPath)} -e ${shellQuote("process.on('SIGHUP', () => {}); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);")} >/dev/null 2>&1 & helper_pid=$!`,
			`echo "$helper_pid" > ${shellQuote(helperPidPath)}`,
			"sleep 60",
		].join("; ");

		const open = await client.request({
			type: "open",
			id: sessionId,
			meta: {
				shell: "/bin/bash",
				argv: ["-c", script],
				cwd: repoRoot,
				cols: 80,
				rows: 24,
				env: {
					...stringEnv(process.env),
					TERM: "xterm-256color",
				},
			},
		});
		if (open.type !== "open-ok") {
			throw new Error(`open failed: ${JSON.stringify(open)}`);
		}
		console.log(`[smoke] shell pid: ${open.pid}`);

		await waitFor(
			() => readPositivePidFile(helperPidPath) !== null,
			DEFAULT_TIMEOUT_MS,
			() => `helper pid file was not written; daemon stderr:\n${daemonStderr}`,
		);
		helperPid = readPositivePidFile(helperPidPath);
		if (!Number.isInteger(helperPid) || helperPid <= 0) {
			throw new Error(
				`invalid helper pid: ${readFileSync(helperPidPath, "utf8")}`,
			);
		}
		console.log(`[smoke] background helper pid: ${helperPid}`);
		console.log(`[smoke] before close: ${processRow(helperPid) ?? "missing"}`);

		const closed = await client.request({ type: "close", id: sessionId });
		if (closed.type !== "closed") {
			throw new Error(`close failed: ${JSON.stringify(closed)}`);
		}

		const cleaned = await waitFor(
			() => !isPidAlive(helperPid),
			DEFAULT_TIMEOUT_MS,
		);
		if (!cleaned) {
			console.error(
				`[smoke] after close: ${processRow(helperPid) ?? "missing"}`,
			);
			console.error("[smoke] FAIL: background helper survived terminal close");
			process.exitCode = 1;
		} else {
			console.log("[smoke] PASS: background helper was reaped");
		}
	} catch (error) {
		console.error(
			`[smoke] ERROR: ${error instanceof Error ? error.stack : error}`,
		);
		process.exitCode = 1;
	} finally {
		if (helperPid !== null && isPidAlive(helperPid)) {
			console.error(
				`[smoke] cleanup: killing leaked test helper pid ${helperPid}`,
			);
			killPid(helperPid, "SIGKILL");
		}
		await client?.dispose().catch(() => {});
		await stopProcess(daemonProcess);
		rmSync(tmpDir, { recursive: true, force: true });
	}
}

await main();

async function findProductionDaemon(orgId) {
	const manifests = listProductionDaemonManifests().filter((manifest) => {
		if (orgId && manifest.organizationId !== orgId) return false;
		if (!isPidAlive(manifest.pid)) return false;
		if (!fileExists(manifest.socketPath)) return false;
		return true;
	});

	const connectable = [];
	for (const manifest of manifests) {
		if (await canConnect(manifest.socketPath)) {
			connectable.push(manifest);
		}
	}

	if (connectable.length === 0) {
		const suffix = orgId ? ` for org ${orgId}` : "";
		throw new Error(`no running production pty-daemon manifest found${suffix}`);
	}

	connectable.sort((a, b) => b.startedAt - a.startedAt);
	if (connectable.length > 1 && !orgId) {
		console.log("[smoke] multiple production daemons found; using newest:");
		for (const manifest of connectable) {
			console.log(
				`[smoke] candidate org=${manifest.organizationId} pid=${manifest.pid} startedAt=${new Date(manifest.startedAt).toISOString()} socket=${manifest.socketPath}`,
			);
		}
	}

	return connectable[0];
}

function listProductionDaemonManifests() {
	const home =
		process.env.SUPERSET_HOME_DIR || path.join(os.homedir(), ".superset");
	const hostDir = path.join(home, "host");
	if (!existsSync(hostDir)) return [];

	const manifests = [];
	for (const entry of readdirSync(hostDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const filePath = path.join(hostDir, entry.name, "pty-daemon-manifest.json");
		if (!existsSync(filePath)) continue;
		try {
			const data = JSON.parse(readFileSync(filePath, "utf8"));
			if (
				typeof data.pid !== "number" ||
				typeof data.socketPath !== "string" ||
				typeof data.startedAt !== "number" ||
				typeof data.organizationId !== "string"
			) {
				continue;
			}
			manifests.push({
				pid: data.pid,
				socketPath: data.socketPath,
				startedAt: data.startedAt,
				organizationId: data.organizationId,
			});
		} catch {
			// Ignore invalid or concurrently-written manifests.
		}
	}
	return manifests;
}

function canConnect(socketPath) {
	return new Promise((resolve) => {
		const socket = net.createConnection({ path: socketPath });
		const timer = setTimeout(() => {
			socket.destroy();
			resolve(false);
		}, 1000);
		socket.once("connect", () => {
			clearTimeout(timer);
			socket.end();
			resolve(true);
		});
		socket.once("error", () => {
			clearTimeout(timer);
			resolve(false);
		});
	});
}

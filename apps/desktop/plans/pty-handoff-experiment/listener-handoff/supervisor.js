#!/usr/bin/env node
// Drives the spike. Spawns daemonA fresh, signals it to handoff, verifies
// daemonB serves new connections on the same socket without a rebind.

const childProcess = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const SOCKET_PATH = path.join("/tmp", `spike-listener-${process.pid}.sock`);
const DAEMON_PATH = path.join(__dirname, "daemon.js");

function log(msg) {
	process.stderr.write(`[supervisor pid=${process.pid}] ${msg}\n`);
}

function unlinkSafe(p) {
	try {
		fs.unlinkSync(p);
	} catch (err) {
		if (err.code !== "ENOENT") throw err;
	}
}

function rawConnect(socketPath, attempt) {
	return new Promise((resolve, reject) => {
		const sock = net.createConnection(socketPath);
		let buf = "";
		sock.setEncoding("utf8");
		sock.on("data", (d) => {
			buf += d;
		});
		sock.on("end", () => resolve(buf.trim()));
		sock.on("error", (err) =>
			reject(new Error(`connect ${attempt}: ${err.message}`)),
		);
	});
}

async function waitForDaemonReady(p, timeoutMs = 2000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			fs.accessSync(p);
			return;
		} catch {
			await new Promise((r) => setTimeout(r, 50));
		}
	}
	throw new Error(`daemon socket ${p} did not appear in ${timeoutMs}ms`);
}

async function connectWithRetry(socketPath, attempt, maxRetries = 20) {
	let lastErr;
	for (let i = 0; i < maxRetries; i++) {
		try {
			return await rawConnect(socketPath, attempt);
		} catch (err) {
			lastErr = err;
			await new Promise((r) => setTimeout(r, 50));
		}
	}
	throw lastErr;
}

async function main() {
	unlinkSafe(SOCKET_PATH);

	// Spawn daemonA, which binds the socket itself.
	const daemonA = childProcess.spawn(
		process.execPath,
		[DAEMON_PATH, "fresh", SOCKET_PATH, "A"],
		{ stdio: ["ignore", "inherit", "inherit"] },
	);
	log(`spawned daemonA pid=${daemonA.pid}`);

	await waitForDaemonReady(SOCKET_PATH);

	const reply1 = await rawConnect(SOCKET_PATH, 1);
	log(`connect 1 -> ${reply1}`);
	if (!reply1.includes(`pid=${daemonA.pid}`)) {
		throw new Error(`expected daemonA pid in reply1, got: ${reply1}`);
	}
	const reply2 = await rawConnect(SOCKET_PATH, 2);
	log(`connect 2 -> ${reply2}`);

	// Trigger handoff.
	log("sending SIGUSR1 to daemonA (handoff)");

	// Watch for daemonA's exit.
	const aExit = new Promise((resolve) => {
		daemonA.once("exit", (code, signal) => resolve({ code, signal }));
	});

	daemonA.kill("SIGUSR1");

	// Wait for daemonA to exit (signals successor is up + ack'd).
	const exitInfo = await aExit;
	log(`daemonA exited code=${exitInfo.code} signal=${exitInfo.signal}`);

	// daemonB is now serving on the inherited listener fd. Connect.
	// (Use retry — there's a brief window during handoff where connections
	// are dropped intentionally.)
	const reply3 = await connectWithRetry(SOCKET_PATH, 3);
	log(`connect 3 -> ${reply3}`);
	const reply4 = await connectWithRetry(SOCKET_PATH, 4);
	log(`connect 4 -> ${reply4}`);

	if (reply3.includes(`pid=${daemonA.pid}`)) {
		throw new Error(
			`reply3 still answered by daemonA — handoff didn't take: ${reply3}`,
		);
	}
	if (!reply3.startsWith("from pid=")) {
		throw new Error(`reply3 malformed: ${reply3}`);
	}
	const successorPid = reply3.split("pid=")[1];
	if (!reply4.includes(`pid=${successorPid}`)) {
		throw new Error(
			`reply4 came from different pid than reply3: ${reply3} vs ${reply4}`,
		);
	}

	log(
		`PASS — listener fd transferred from daemonA (pid ${daemonA.pid}) to daemonB (pid ${successorPid}), no rebind needed`,
	);

	// Cleanup: kill daemonB.
	process.kill(Number(successorPid), "SIGTERM");
	await new Promise((r) => setTimeout(r, 200));
	unlinkSafe(SOCKET_PATH);
}

main().catch((err) => {
	log(`FAIL: ${err.stack ?? err.message}`);
	unlinkSafe(SOCKET_PATH);
	process.exit(1);
});

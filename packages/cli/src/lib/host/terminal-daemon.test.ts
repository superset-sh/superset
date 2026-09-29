import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const tempHome = mkdtempSync(join(tmpdir(), "superset-cli-ptyd-"));
process.env.SUPERSET_HOME_DIR = tempHome;

const { readPtyDaemonManifest, writePtyDaemonManifest } = await import(
	"@superset/host-service/daemon-manifest"
);
const { stopTerminalDaemon } = await import("./terminal-daemon");

const spawned: Bun.Subprocess[] = [];

afterAll(() => {
	for (const child of spawned) child.kill("SIGKILL");
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
	rmSync(tempHome, { recursive: true, force: true });
});

async function startProcess(script: string, env: Record<string, string> = {}) {
	const child = Bun.spawn([process.execPath, "-e", script], {
		stdout: "pipe",
		stderr: "ignore",
		env: { ...process.env, ...env },
	});
	spawned.push(child);
	await child.stdout.getReader().read();
	return child;
}

// Answers every connection with a pty-daemon hello-ack frame:
// [u32 total length][u32 json length][json].
const FAKE_DAEMON = `
const reportedPid = process.env.REPORTED_PID === "none"
	? undefined
	: Number(process.env.REPORTED_PID || process.pid);
const json = Buffer.from(JSON.stringify({
	type: "hello-ack", protocol: 1, daemonVersion: "0.0.0-test", daemonPid: reportedPid,
}));
const frame = Buffer.alloc(8 + json.length);
frame.writeUInt32BE(4 + json.length, 0);
frame.writeUInt32BE(json.length, 4);
json.copy(frame, 8);
require("node:net")
	.createServer((socket) => socket.once("data", () => socket.write(frame)))
	.listen(process.env.SOCKET_PATH, () => console.log("ready"));
`;

const SLEEPER = "setInterval(() => {}, 1000); console.log('ready');";

function writeDaemonManifest(
	organizationId: string,
	pid: number,
	socketPath: string,
) {
	writePtyDaemonManifest({
		pid,
		socketPath,
		protocolVersions: [1],
		startedAt: Date.now(),
		organizationId,
	});
}

describe("stopTerminalDaemon", () => {
	test("SIGTERMs the daemon that answers on the socket and removes its manifest", async () => {
		const socketPath = join(tempHome, "live.sock");
		const daemon = await startProcess(FAKE_DAEMON, { SOCKET_PATH: socketPath });
		writeDaemonManifest("org-live", daemon.pid, socketPath);

		const pids = await stopTerminalDaemon("org-live");
		await daemon.exited;

		expect(pids).toEqual([daemon.pid]);
		expect(daemon.signalCode).toBe("SIGTERM");
		expect(readPtyDaemonManifest("org-live")).toBeNull();
	});

	test("signals the pid the daemon reports, not a recycled manifest pid", async () => {
		const socketPath = join(tempHome, "handoff.sock");
		const successor = await startProcess(SLEEPER);
		const daemon = await startProcess(FAKE_DAEMON, {
			SOCKET_PATH: socketPath,
			REPORTED_PID: String(successor.pid),
		});
		const recycled = await startProcess(SLEEPER);
		writeDaemonManifest("org-handoff", recycled.pid, socketPath);

		const pids = await stopTerminalDaemon("org-handoff");
		await successor.exited;

		expect(pids).toContain(successor.pid);
		expect(successor.signalCode).toBe("SIGTERM");
		expect(recycled.exitCode).toBeNull();
		expect(recycled.signalCode).toBeNull();
		daemon.kill("SIGKILL");
	});

	test("refuses to signal a daemon that does not report its pid", async () => {
		const socketPath = join(tempHome, "old.sock");
		const daemon = await startProcess(FAKE_DAEMON, {
			SOCKET_PATH: socketPath,
			REPORTED_PID: "none",
		});
		writeDaemonManifest("org-old", daemon.pid, socketPath);

		await expect(stopTerminalDaemon("org-old")).rejects.toThrow(
			/does not report its pid/,
		);

		expect(daemon.exitCode).toBeNull();
		expect(daemon.signalCode).toBeNull();
		expect(readPtyDaemonManifest("org-old")?.pid).toBe(daemon.pid);
	});

	test("keeps the manifest of a daemon that accepts but does not answer", async () => {
		const socketPath = join(tempHome, "silent.sock");
		const daemon = await startProcess(
			`require("node:net").createServer(() => {}).listen(process.env.SOCKET_PATH, () => console.log("ready"));`,
			{ SOCKET_PATH: socketPath },
		);
		writeDaemonManifest("org-silent", daemon.pid, socketPath);

		await expect(stopTerminalDaemon("org-silent")).rejects.toThrow(
			/did not answer/,
		);

		expect(daemon.exitCode).toBeNull();
		expect(daemon.signalCode).toBeNull();
		expect(readPtyDaemonManifest("org-silent")?.pid).toBe(daemon.pid);
	});

	test("removes a stale manifest without signalling its pid", async () => {
		const unrelated = await startProcess(SLEEPER);
		writeDaemonManifest(
			"org-stale",
			unrelated.pid,
			join(tempHome, "gone.sock"),
		);

		const pids = await stopTerminalDaemon("org-stale");

		expect(pids).toEqual([]);
		expect(unrelated.exitCode).toBeNull();
		expect(unrelated.signalCode).toBeNull();
		expect(readPtyDaemonManifest("org-stale")).toBeNull();
	});

	test("keeps a manifest that a new daemon wrote while stopping", async () => {
		const socketPath = join(tempHome, "replaced.sock");
		const daemon = await startProcess(
			`process.on("SIGTERM", () => {
				require("node:fs").writeFileSync(process.env.MANIFEST_PATH, JSON.stringify({
					pid: 999999, socketPath: "/nowhere.sock", protocolVersions: [1],
					startedAt: 1, organizationId: "org-replaced",
				}));
				process.exit(0);
			});
			${FAKE_DAEMON}`,
			{
				SOCKET_PATH: socketPath,
				MANIFEST_PATH: join(
					tempHome,
					"host",
					"org-replaced",
					"pty-daemon-manifest.json",
				),
			},
		);
		writeDaemonManifest("org-replaced", daemon.pid, socketPath);

		await stopTerminalDaemon("org-replaced");

		expect(readPtyDaemonManifest("org-replaced")?.pid).toBe(999999);
	});

	test("returns nothing when there is no daemon manifest", async () => {
		expect(await stopTerminalDaemon("org-none")).toEqual([]);
	});
});

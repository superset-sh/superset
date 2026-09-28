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

async function startProcess(script: string) {
	const child = Bun.spawn([process.execPath, "-e", script], {
		stdout: "pipe",
		stderr: "ignore",
	});
	spawned.push(child);
	await child.stdout.getReader().read();
	return child;
}

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
	test("SIGTERMs a daemon that answers on its socket and removes its manifest", async () => {
		const socketPath = join(tempHome, "live.sock");
		const daemon = await startProcess(
			`require("node:net").createServer().listen(${JSON.stringify(socketPath)}, () => console.log("ready"));`,
		);
		writeDaemonManifest("org-live", daemon.pid, socketPath);

		const pid = await stopTerminalDaemon("org-live");
		await daemon.exited;

		expect(pid).toBe(daemon.pid);
		expect(daemon.signalCode).toBe("SIGTERM");
		expect(readPtyDaemonManifest("org-live")).toBeNull();
	});

	test("does not signal the pid of a stale manifest", async () => {
		const unrelated = await startProcess(
			"setInterval(() => {}, 1000); console.log('ready');",
		);
		writeDaemonManifest(
			"org-stale",
			unrelated.pid,
			join(tempHome, "gone.sock"),
		);

		const pid = await stopTerminalDaemon("org-stale");

		expect(pid).toBeNull();
		expect(unrelated.exitCode).toBeNull();
		expect(unrelated.signalCode).toBeNull();
		expect(readPtyDaemonManifest("org-stale")).toBeNull();
	});

	test("returns null when there is no daemon manifest", async () => {
		expect(await stopTerminalDaemon("org-none")).toBeNull();
	});
});

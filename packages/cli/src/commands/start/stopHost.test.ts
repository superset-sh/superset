import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const tempHome = mkdtempSync(join(tmpdir(), "superset-cli-stop-host-"));
process.env.SUPERSET_HOME_DIR = tempHome;

const { readManifest, writeManifest } = await import("../../lib/host/manifest");
const { stopHost } = await import("./stopHost");

const fakeHostPids: number[] = [];

afterAll(() => {
	for (const pid of fakeHostPids) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {}
	}
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
	rmSync(tempHome, { recursive: true, force: true });
});

async function startFakeHost(script: string) {
	const child = Bun.spawn([process.execPath, "-e", script], {
		stdout: "pipe",
		stderr: "ignore",
	});
	const exited = child.exited.then(() => ({
		code: child.exitCode,
		signal: child.signalCode,
	}));
	await child.stdout.getReader().read();
	const { pid } = child;
	fakeHostPids.push(pid);
	const organizationId = `org-${pid}`;
	writeManifest({
		pid,
		endpoint: "http://127.0.0.1:1",
		authToken: "secret",
		startedAt: Date.now(),
		organizationId,
	});
	return { pid, exited, organizationId };
}

describe("stopHost", () => {
	test("SIGTERMs the host and clears the manifest", async () => {
		const host = await startFakeHost(
			"setInterval(() => {}, 1000); console.log('ready');",
		);

		const exit = await stopHost({ ...host, timeoutMs: 5_000 });

		expect(exit.signal).toBe("SIGTERM");
		expect(readManifest(host.organizationId)).toBeNull();
	});

	test("escalates to SIGKILL when the host ignores SIGTERM", async () => {
		const host = await startFakeHost(
			"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); console.log('ready');",
		);

		const exit = await stopHost({ ...host, timeoutMs: 200 });

		expect(exit.signal).toBe("SIGKILL");
		expect(readManifest(host.organizationId)).toBeNull();
	});

	test("keeps a manifest that belongs to another host", async () => {
		const host = await startFakeHost(
			"setInterval(() => {}, 1000); console.log('ready');",
		);
		writeManifest({
			pid: host.pid + 1,
			endpoint: "http://127.0.0.1:1",
			authToken: "secret",
			startedAt: Date.now(),
			organizationId: host.organizationId,
		});

		await stopHost({ ...host, timeoutMs: 5_000 });

		expect(readManifest(host.organizationId)?.pid).toBe(host.pid + 1);
	});
});

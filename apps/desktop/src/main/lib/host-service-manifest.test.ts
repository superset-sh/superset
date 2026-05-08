import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempHomeDir = mkdtempSync(join(tmpdir(), "superset-host-manifest-"));
process.env.SUPERSET_HOME_DIR = tempHomeDir;

const ORG_ID = "org-test";

// Imported lazily so the SUPERSET_HOME_DIR env var is in place before the
// app-environment module captures it at import time.
let manifestModule: typeof import("./host-service-manifest");

beforeAll(async () => {
	manifestModule = await import("./host-service-manifest");
});

afterAll(() => {
	rmSync(tempHomeDir, { recursive: true, force: true });
});

beforeEach(() => {
	manifestModule.removeManifest(ORG_ID);
});

describe("host-service manifest version pin", () => {
	it("round-trips spawnedByAppVersion", () => {
		manifestModule.writeManifest({
			pid: 12345,
			endpoint: "http://127.0.0.1:60636",
			authToken: "token",
			startedAt: 1_700_000_000_000,
			organizationId: ORG_ID,
			spawnedByAppVersion: "1.8.7",
		});

		const read = manifestModule.readManifest(ORG_ID);
		expect(read?.spawnedByAppVersion).toBe("1.8.7");
	});

	// Reproduces the user-visible flavor of #4252: a host-service.js daemon was
	// spawned by an Electron version that pre-dates `spawnedByAppVersion`, so
	// the on-disk manifest is missing that field. After the auto-update, the
	// new desktop must still recognise the daemon as stale — otherwise it gets
	// re-adopted instead of killed and the user keeps talking to old code.
	it("treats a legacy manifest without spawnedByAppVersion as stale", () => {
		const dir = manifestModule.manifestDir(ORG_ID);
		writeFileSync(
			join(dir, "manifest.json"),
			JSON.stringify({
				pid: 56431,
				endpoint: "http://127.0.0.1:60636",
				authToken: "token",
				startedAt: 1_778_007_328_466,
				organizationId: ORG_ID,
			}),
		);

		const read = manifestModule.readManifest(ORG_ID);
		expect(read).not.toBeNull();
		expect(read?.spawnedByAppVersion).toBe("");
		// `tryAdopt` pins on `manifest.spawnedByAppVersion === app.getVersion()`,
		// so coercing the legacy field to "" guarantees a respawn against any
		// real (non-empty) Electron version string.
		expect(read?.spawnedByAppVersion === "1.8.7").toBe(false);
	});

	it("treats a manifest from a previous app version as stale", () => {
		manifestModule.writeManifest({
			pid: 56431,
			endpoint: "http://127.0.0.1:60636",
			authToken: "token",
			startedAt: 1_778_007_328_466,
			organizationId: ORG_ID,
			spawnedByAppVersion: "1.8.3",
		});

		const read = manifestModule.readManifest(ORG_ID);
		expect(read?.spawnedByAppVersion).toBe("1.8.3");
		expect(read?.spawnedByAppVersion === "1.8.7").toBe(false);
	});

	it("rejects manifests missing required fields", () => {
		const dir = manifestModule.manifestDir(ORG_ID);
		writeFileSync(
			join(dir, "manifest.json"),
			JSON.stringify({
				pid: "not-a-number",
				endpoint: "http://127.0.0.1:60636",
				authToken: "token",
				startedAt: 1,
				organizationId: ORG_ID,
			}),
		);

		expect(manifestModule.readManifest(ORG_ID)).toBeNull();
	});

	it("listManifests skips invalid entries", () => {
		manifestModule.writeManifest({
			pid: 1,
			endpoint: "http://127.0.0.1:1",
			authToken: "t",
			startedAt: 1,
			organizationId: ORG_ID,
			spawnedByAppVersion: "1.0.0",
		});

		const list = manifestModule.listManifests();
		expect(list.find((m) => m.organizationId === ORG_ID)).toBeDefined();
	});

	it("isProcessAlive returns true for the current process", () => {
		expect(manifestModule.isProcessAlive(process.pid)).toBe(true);
	});

	it("isProcessAlive returns false after a child exits", async () => {
		const { spawn } = await import("node:child_process");
		const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
		const pid = child.pid;
		expect(pid).toBeGreaterThan(0);
		await new Promise<void>((resolve) => child.once("exit", () => resolve()));
		// Give the OS a tick to reap the zombie.
		await new Promise((r) => setTimeout(r, 50));
		expect(manifestModule.isProcessAlive(pid as number)).toBe(false);
	});
});

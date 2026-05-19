import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// `host-service-manifest` derives its on-disk location from `SUPERSET_HOME_DIR`,
// which `app-environment.ts` resolves from `process.env.SUPERSET_HOME_DIR` at
// module load. Point that at a tmp dir before importing so the test never
// touches a developer's real `~/.superset/host` directory.
const HOME = mkdtempSync(join(tmpdir(), "superset-manifest-test-"));
process.env.SUPERSET_HOME_DIR = HOME;

const { manifestDir, readManifest, writeManifest } = await import(
	"./host-service-manifest"
);

const ORG = "org-4252";

afterEach(() => {
	try {
		rmSync(manifestDir(ORG), { recursive: true, force: true });
	} catch {}
});

describe("host-service manifest version pin (regression: #4252)", () => {
	test("round-trips spawnedByAppVersion", () => {
		writeManifest({
			pid: 12345,
			endpoint: "http://127.0.0.1:60636",
			authToken: "secret",
			startedAt: 1_700_000_000_000,
			organizationId: ORG,
			spawnedByAppVersion: "1.8.3",
		});

		const read = readManifest(ORG);
		expect(read).not.toBeNull();
		expect(read?.spawnedByAppVersion).toBe("1.8.3");
	});

	test("coerces a pre-upgrade manifest with no spawnedByAppVersion to empty string", () => {
		// Reproduces the on-disk state from #4252: a host-service.js daemon was
		// spawned by an app build that predates #4229, so its manifest has no
		// `spawnedByAppVersion` field. After Squirrel auto-update, the new app
		// must NOT silently adopt that stale daemon. Empty-string coercion makes
		// `tryAdopt`'s strict-equality check (`manifest.spawnedByAppVersion !==
		// app.getVersion()`) trip for every legacy manifest, so the stale PID
		// gets SIGTERM'd and a fresh daemon is spawned from the new bundle.
		const dir = manifestDir(ORG);
		mkdirSync(dir, { recursive: true });
		const legacy = {
			pid: 56431,
			endpoint: "http://127.0.0.1:60636",
			authToken: "legacy-secret",
			startedAt: 1_699_000_000_000,
			organizationId: ORG,
		};
		writeFileSync(join(dir, "manifest.json"), JSON.stringify(legacy));

		const read = readManifest(ORG);
		expect(read).not.toBeNull();
		expect(read?.pid).toBe(56431);
		expect(read?.spawnedByAppVersion).toBe("");
	});

	test("rejects a manifest missing required fields", () => {
		const dir = manifestDir(ORG);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "manifest.json"), JSON.stringify({ pid: 1 }));

		expect(readManifest(ORG)).toBeNull();
	});
});

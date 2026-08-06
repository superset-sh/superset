import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempHome = mkdtempSync(join(tmpdir(), "superset-cli-daemon-manifest-"));
process.env.SUPERSET_HOME_DIR = tempHome;

const ORG_ID = "test-org";
const MANIFEST_DIR = join(tempHome, "host", ORG_ID);
const MANIFEST_PATH = join(MANIFEST_DIR, "pty-daemon-manifest.json");

const {
	readPtyDaemonManifest,
	removePtyDaemonManifest,
	writePtyDaemonManifest,
} = await import("./pty-daemon-manifest");

describe("pty-daemon-manifest", () => {
	afterAll(() => {
		rmSync(tempHome, { recursive: true, force: true });
	});

	test("returns null when no manifest exists", () => {
		expect(readPtyDaemonManifest(ORG_ID)).toBeNull();
	});

	test("round-trips a written manifest", () => {
		writePtyDaemonManifest({
			pid: 5151,
			socketPath: "/tmp/x.sock",
			protocolVersions: [1],
			startedAt: 1700000000000,
			organizationId: ORG_ID,
		});
		const read = readPtyDaemonManifest(ORG_ID);
		expect(read).not.toBeNull();
		expect(read?.pid).toBe(5151);
		expect(read?.organizationId).toBe(ORG_ID);
	});

	test("removes the manifest file", () => {
		mkdirSync(MANIFEST_DIR, { recursive: true });
		writeFileSync(MANIFEST_PATH, JSON.stringify({ pid: 1 }));
		removePtyDaemonManifest(ORG_ID);
		expect(readPtyDaemonManifest(ORG_ID)).toBeNull();
	});

	test("returns null for a corrupt manifest", () => {
		mkdirSync(MANIFEST_DIR, { recursive: true });
		writeFileSync(MANIFEST_PATH, "{not json");
		expect(readPtyDaemonManifest(ORG_ID)).toBeNull();
	});
});

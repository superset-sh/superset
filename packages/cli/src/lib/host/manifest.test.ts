import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const tempHome = mkdtempSync(join(tmpdir(), "superset-cli-manifest-"));
process.env.SUPERSET_HOME_DIR = tempHome;

const { readManifest, removeManifestIfOwnedBy, writeManifest } = await import(
	"./manifest"
);

afterAll(() => {
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
	rmSync(tempHome, { recursive: true, force: true });
});

function writeFor(organizationId: string, pid: number) {
	writeManifest({
		pid,
		endpoint: "http://127.0.0.1:1",
		authToken: "secret",
		startedAt: Date.now(),
		organizationId,
	});
}

describe("removeManifestIfOwnedBy", () => {
	test("removes the manifest when the pid matches", () => {
		writeFor("org-owned", 4242);

		removeManifestIfOwnedBy("org-owned", 4242);

		expect(readManifest("org-owned")).toBeNull();
	});

	test("keeps a manifest that another host wrote", () => {
		writeFor("org-replaced", 4243);

		removeManifestIfOwnedBy("org-replaced", 4242);

		expect(readManifest("org-replaced")?.pid).toBe(4243);
	});
});

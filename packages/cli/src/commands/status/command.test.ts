import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliContext } from "../../lib/command";

const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const tempHome = mkdtempSync(join(tmpdir(), "superset-cli-status-"));
process.env.SUPERSET_HOME_DIR = tempHome;

const { removeManifest, writeManifest } = await import(
	"../../lib/host/manifest"
);
const statusCommand = (await import("./command")).default;

afterAll(() => {
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
	rmSync(tempHome, { recursive: true, force: true });
});

const ORG = { id: "org-1", slug: "org-1", name: "Palette" };

afterEach(() => removeManifest(ORG.id));

function makeCtx(): CliContext {
	const query = mock(async () => [ORG]);
	const hostListQuery = mock(async () => []);
	return {
		api: {
			user: { myOrganizations: { query } },
			host: { list: { query: hostListQuery } },
		},
		config: {},
		bearer: "bearer-token",
		authSource: "apiKey",
	} as unknown as CliContext;
}

type Result = { data: Record<string, unknown>; message?: string };

function run(): Promise<Result> {
	return statusCommand.run({
		ctx: makeCtx(),
		args: {},
		options: { org: undefined },
		signal: new AbortController().signal,
	} as never) as Promise<Result>;
}

describe("superset status manifest liveness", () => {
	test("reports not running when there is no manifest", async () => {
		const result = await run();
		expect(result.data).toMatchObject({ running: false });
		expect(result.message).toContain("Not running");
	});

	test("reports a stale manifest when the recorded pid is dead", async () => {
		writeManifest({
			pid: 999_999,
			endpoint: "http://127.0.0.1:19991",
			authToken: "secret",
			startedAt: Date.now(),
			organizationId: ORG.id,
		});

		const result = await run();
		expect(result.data).toMatchObject({
			running: false,
			stale: true,
			pid: 999_999,
		});
		expect(result.message).toContain("is dead");
	});

	test("reports a stale manifest when the recorded pid is alive but belongs to a different process (pid reuse)", async () => {
		// The current test-runner process is alive, but it is certainly not
		// the superset-host binary — reproducing the bug report's scenario
		// where an unrelated process inherits a pid the manifest still names.
		writeManifest({
			pid: process.pid,
			endpoint: "http://127.0.0.1:19992",
			authToken: "secret",
			startedAt: Date.now(),
			organizationId: ORG.id,
		});

		const result = await run();
		expect(result.data).toMatchObject({
			running: false,
			stale: true,
			pid: process.pid,
		});
		expect(result.message).toContain("belongs to a different process");
	});

	// A normal running host (live pid, command matches the host binary) is
	// covered at the unit level in lib/host/manifest-liveness.test.ts, with
	// the identity check dependency-injected instead of relying on a real
	// spawned process and `ps` — matching a genuine `superset-host` process
	// portably from a test fixture isn't reliable across environments.
});

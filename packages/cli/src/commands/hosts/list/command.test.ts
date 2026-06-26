import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// SUPERSET_HOME_DIR is read at module-load time, so point it at a temp dir
// before importing anything that resolves the manifest location.
const tempHome = mkdtempSync(join(tmpdir(), "superset-cli-hosts-list-"));
const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
process.env.SUPERSET_HOME_DIR = tempHome;

const { getHostId } = await import("@superset/shared/host-info");
const { writeManifest, removeManifest } = await import(
	"../../../lib/host/manifest"
);
const { formatOutput } = await import("@superset/cli-framework");
const { default: hostsList } = await import("./command");

const ORG_ID = "11111111-1111-1111-1111-111111111111";

type Row = {
	id: string;
	name: string;
	online: boolean;
	organizationId: string;
};

function createCtx(rows: Row[]) {
	return {
		api: {
			host: {
				list: {
					query: async (_input: { organizationId: string }) => rows,
				},
			},
		},
		config: { organizationId: ORG_ID },
		bearer: "test-token",
		authSource: "oauth" as const,
	} as never;
}

function render(result: unknown): string {
	// Mirror the real CLI: use the command's own display function (if any).
	return formatOutput(result, hostsList.display, { json: false, quiet: false });
}

async function runCommand(rows: Row[]) {
	return hostsList.run({
		ctx: createCtx(rows),
		options: {} as never,
		args: {} as never,
		signal: new AbortController().signal,
	});
}

afterAll(() => {
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
	rmSync(tempHome, { recursive: true, force: true });
});

beforeEach(() => {
	removeManifest(ORG_ID);
});

describe("hosts list", () => {
	test("reproduces #5059: silent empty result when a healthy local host is running but unregistered", async () => {
		// A host service is running locally for this org (live manifest, our own
		// pid so isProcessAlive() is true), mirroring `superset status` reporting
		// running:true / healthy:true.
		writeManifest({
			pid: process.pid,
			endpoint: "http://127.0.0.1:51234",
			authToken: "local-token",
			startedAt: Date.now(),
			organizationId: ORG_ID,
		});

		// The cloud `host.list` legitimately sees nothing because the local
		// daemon never registered to the relay.
		const result = await runCommand([]);
		const output = render(result);

		// The empty cloud result must be made legible: the user should learn that
		// a host is running locally but is not registered to the cloud org —
		// instead of a bare "No results." that looks like broken auth / wrong org.
		expect(output).not.toBe("No results.");
		expect(output.toLowerCase()).toContain("running locally");
		expect(output.toLowerCase()).toContain("not registered");
		expect(output).toContain(getHostId().slice(0, 8));
	});

	test("lists registered hosts normally", async () => {
		const result = await runCommand([
			{
				id: "abc123",
				name: "Mac Desktop",
				online: true,
				organizationId: ORG_ID,
			},
		]);
		const output = render(result);
		expect(output).toContain("Mac Desktop");
		expect(output).toContain("yes");
	});

	test("does not add the local-host hint when no host is running", async () => {
		// No manifest written → no local host service running.
		const result = await runCommand([]);
		const output = render(result);
		expect(output.toLowerCase()).not.toContain("not registered");
	});
});

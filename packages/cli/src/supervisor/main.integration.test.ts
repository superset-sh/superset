import { afterEach, describe, expect, it } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	acquireUpdateLock,
	readUpdateLock,
	readUpdateResult,
} from "@superset/host-service/update-protocol";

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000321";
const PREVIOUS_VERSION = "1.14.0";
const TARGET_VERSION = "1.15.0";
const processes = new Set<number>();
const directories = new Set<string>();

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function waitFor(
	condition: () => boolean,
	timeoutMs = 5_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (condition()) return;
		await Bun.sleep(25);
	}
	throw new Error("Timed out waiting for supervisor fixture state");
}

async function createFixture() {
	const root = mkdtempSync(join(tmpdir(), "host-supervisor-e2e-"));
	directories.add(root);
	const homeDir = join(root, ".superset");
	const organizationDir = join(homeDir, "host", ORGANIZATION_ID);
	const installRoot = join(root, "install");
	const binDir = join(installRoot, "bin");
	mkdirSync(organizationDir, { recursive: true });
	mkdirSync(binDir, { recursive: true });
	writeFileSync(
		join(homeDir, "config.json"),
		JSON.stringify({
			apiKey: "sk_live_test",
			organizationId: ORGANIZATION_ID,
		}),
	);
	writeFileSync(join(installRoot, "version"), PREVIOUS_VERSION);

	const fakeHostPath = join(root, "fake-host.ts");
	writeFileSync(
		fakeHostPath,
		`import { writeFileSync } from "node:fs";
const [manifestPath, organizationId, version] = process.argv.slice(2);
const authToken = "fixture-secret";
const server = Bun.serve({
  port: 0,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/trpc/host.info") {
	  if (request.headers.get("authorization") !== "Bearer " + authToken) {
	    return new Response("unauthorized", { status: 401 });
	  }
	  if (url.searchParams.get("input") !== JSON.stringify({ json: null })) {
	    return new Response("missing tRPC input", { status: 400 });
	  }
      return Response.json({ result: { data: { json: { version } } } });
    }
    return new Response("not found", { status: 404 });
  },
});
writeFileSync(manifestPath, JSON.stringify({
  pid: process.pid,
  endpoint: \`http://127.0.0.1:\${server.port}\`,
  authToken,
  startedAt: Date.now(),
  organizationId,
  version,
}));
process.on("SIGTERM", () => process.exit(0));
await new Promise(() => {});
`,
	);

	const cliPath = join(binDir, "superset");
	writeFileSync(
		cliPath,
		`#!/bin/sh
set -eu
ROOT="${installRoot}"
ORG_DIR="${organizationDir}"
case "$1" in
  update)
    TARGET="$3"
    if [ "$TARGET" = "9.9.9" ]; then
      exit 23
    fi
    rm -rf "$ROOT.bak"
    cp -R "$ROOT" "$ROOT.bak"
    printf '%s' "$TARGET" > "$ROOT/version"
    ;;
  start)
    VERSION="$(cat "$ROOT/version")"
    rm -f "$ORG_DIR/manifest.json"
    "${process.execPath}" "${fakeHostPath}" "$ORG_DIR/manifest.json" "${ORGANIZATION_ID}" "$VERSION" >/dev/null 2>&1 &
    for _ in $(seq 1 100); do
      [ -f "$ORG_DIR/manifest.json" ] && exit 0
      sleep 0.02
    done
    exit 24
    ;;
  *) exit 25 ;;
esac
`,
	);
	chmodSync(cliPath, 0o755);

	const oldHost = Bun.spawn(
		[
			process.execPath,
			fakeHostPath,
			join(organizationDir, "manifest.json"),
			ORGANIZATION_ID,
			PREVIOUS_VERSION,
		],
		{ stdout: "ignore", stderr: "ignore" },
	);
	if (!oldHost.pid) throw new Error("Failed to start old host fixture");
	processes.add(oldHost.pid);
	await waitFor(() => existsSync(join(organizationDir, "manifest.json")));

	return { root, homeDir, organizationDir, installRoot, oldHost };
}

async function runSupervisor(
	fixture: Awaited<ReturnType<typeof createFixture>>,
	target: string,
) {
	const supervisorPath = resolve(import.meta.dir, "main.ts");
	const child = Bun.spawn([process.execPath, supervisorPath], {
		env: {
			...process.env,
			SUPERSET_AUTH_CONFIG_PATH: join(fixture.homeDir, "config.json"),
			SUPERSET_HOME_DIR: fixture.homeDir,
			SUPERSET_INSTALL_ROOT: fixture.installRoot,
			SUPERSET_UPDATE_OLD_PID: String(fixture.oldHost.pid),
			SUPERSET_UPDATE_ORG_ID: ORGANIZATION_ID,
			SUPERSET_UPDATE_TARGET_VERSION: target,
		},
		stdout: "ignore",
		stderr: "pipe",
	});
	if (!child.pid) throw new Error("Failed to start supervisor fixture");
	processes.add(child.pid);

	const lock = acquireUpdateLock({
		organizationId: ORGANIZATION_ID,
		ownerPid: child.pid,
		targetVersion: target,
		previousVersion: PREVIOUS_VERSION,
		homeDir: fixture.homeDir,
	});
	if (!lock.acquired)
		throw new Error("Failed to hand fixture lock to supervisor");

	const exitCode = await child.exited;
	processes.delete(child.pid);
	return exitCode;
}

afterEach(() => {
	for (const pid of processes) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {}
	}
	processes.clear();
	for (const directory of directories) {
		rmSync(directory, { recursive: true, force: true });
	}
	directories.clear();
});

describe("host update supervisor", () => {
	it("updates, restarts, verifies, and releases its lock", async () => {
		const fixture = await createFixture();
		await expect(runSupervisor(fixture, TARGET_VERSION)).resolves.toBe(0);

		expect(isAlive(fixture.oldHost.pid)).toBe(false);
		expect(readUpdateLock(ORGANIZATION_ID, fixture.homeDir)).toBeNull();
		expect(readUpdateResult(ORGANIZATION_ID, fixture.homeDir)).toMatchObject({
			status: "succeeded",
			targetVersion: TARGET_VERSION,
			previousVersion: PREVIOUS_VERSION,
			finalVersion: TARGET_VERSION,
		});
		expect(existsSync(`${fixture.installRoot}.bak`)).toBe(false);

		await waitFor(() =>
			existsSync(join(fixture.organizationDir, "manifest.json")),
		);
		const manifest = JSON.parse(
			readFileSync(join(fixture.organizationDir, "manifest.json"), "utf8"),
		) as { pid: number; version: string };
		processes.add(manifest.pid);
		expect(manifest.version).toBe(TARGET_VERSION);
		expect(isAlive(manifest.pid)).toBe(true);
	});

	it("leaves the old host running when installation fails", async () => {
		const fixture = await createFixture();
		await expect(runSupervisor(fixture, "9.9.9")).resolves.toBe(1);

		expect(isAlive(fixture.oldHost.pid)).toBe(true);
		expect(readUpdateLock(ORGANIZATION_ID, fixture.homeDir)).toBeNull();
		expect(readUpdateResult(ORGANIZATION_ID, fixture.homeDir)).toMatchObject({
			status: "failed",
			targetVersion: "9.9.9",
			previousVersion: PREVIOUS_VERSION,
		});
		expect(readFileSync(join(fixture.installRoot, "version"), "utf8")).toBe(
			PREVIOUS_VERSION,
		);
	});
});

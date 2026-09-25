import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	assertIsolatedDaemonNamespaceInTests,
	type PtyDaemonManifest,
	readPtyDaemonManifest,
	removePtyDaemonManifest,
	writePtyDaemonManifest,
} from "./manifest.ts";

const TEST_HOME = path.join(
	os.tmpdir(),
	`pty-daemon-manifest-test-${process.pid}`,
);
const TEST_ORG = "org-manifest-test";

beforeEach(() => {
	process.env.SUPERSET_HOME_DIR = TEST_HOME;
	fs.mkdirSync(TEST_HOME, { recursive: true });
});

afterEach(() => {
	removePtyDaemonManifest(TEST_ORG);
	fs.rmSync(TEST_HOME, { recursive: true, force: true });
	process.env.SUPERSET_HOME_DIR = undefined;
});

function baseManifest(): PtyDaemonManifest {
	return {
		pid: 12345,
		socketPath: "/tmp/test.sock",
		protocolVersions: [1],
		startedAt: 1700000000000,
		organizationId: TEST_ORG,
	};
}

describe("PtyDaemonManifest", () => {
	test("write + read round-trips required fields", () => {
		writePtyDaemonManifest(baseManifest());
		expect(readPtyDaemonManifest(TEST_ORG)).toEqual(baseManifest());
	});

	test("write + read round-trips Phase 2 handoff fields", () => {
		const manifest: PtyDaemonManifest = {
			...baseManifest(),
			handoffInProgress: true,
			handoffSnapshotPath: "/tmp/handoff-snapshot.json",
			handoffSuccessorPid: 99999,
		};
		writePtyDaemonManifest(manifest);
		expect(readPtyDaemonManifest(TEST_ORG)).toEqual(manifest);
	});

	test("read tolerates extra unknown fields (forward-compat)", () => {
		const dir = path.join(TEST_HOME, "host", TEST_ORG);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, "pty-daemon-manifest.json"),
			JSON.stringify({ ...baseManifest(), futureField: "something" }),
		);
		const out = readPtyDaemonManifest(TEST_ORG);
		expect(out).not.toBeNull();
		expect(out?.pid).toBe(12345);
	});

	test("read drops malformed handoff fields silently", () => {
		const dir = path.join(TEST_HOME, "host", TEST_ORG);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, "pty-daemon-manifest.json"),
			JSON.stringify({
				...baseManifest(),
				handoffInProgress: "not-a-boolean",
				handoffSuccessorPid: "not-a-number",
			}),
		);
		const out = readPtyDaemonManifest(TEST_ORG);
		expect(out).not.toBeNull();
		expect(out?.handoffInProgress).toBeUndefined();
		expect(out?.handoffSuccessorPid).toBeUndefined();
	});

	test("read returns null when required fields are missing", () => {
		const dir = path.join(TEST_HOME, "host", TEST_ORG);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(
			path.join(dir, "pty-daemon-manifest.json"),
			JSON.stringify({ pid: 1 }),
		);
		expect(readPtyDaemonManifest(TEST_ORG)).toBeNull();
	});
});

describe("assertIsolatedDaemonNamespaceInTests", () => {
	test("throws for test-runner contexts on the default home", () => {
		expect(() =>
			assertIsolatedDaemonNamespaceInTests({ NODE_ENV: "test" }),
		).toThrow(/isolated temp dir/);
		expect(() =>
			assertIsolatedDaemonNamespaceInTests({
				NODE_TEST_CONTEXT: "child-v8",
			} as NodeJS.ProcessEnv),
		).toThrow(/isolated temp dir/);
		expect(() =>
			assertIsolatedDaemonNamespaceInTests({
				NODE_ENV: "test",
				SUPERSET_HOME_DIR: path.join(os.homedir(), ".superset"),
			}),
		).toThrow(/isolated temp dir/);
		// Aliases of the default home must not slip past the guard.
		expect(() =>
			assertIsolatedDaemonNamespaceInTests({
				NODE_ENV: "test",
				SUPERSET_HOME_DIR: `${path.join(os.homedir(), ".superset")}${path.sep}`,
			}),
		).toThrow(/isolated temp dir/);
		expect(() =>
			assertIsolatedDaemonNamespaceInTests({
				NODE_ENV: "test",
				SUPERSET_HOME_DIR: path.join(
					os.homedir(),
					"somewhere",
					"..",
					".superset",
				),
			}),
		).toThrow(/isolated temp dir/);
	});

	test("passes with an isolated home, and outside test runners", () => {
		expect(() =>
			assertIsolatedDaemonNamespaceInTests({
				NODE_ENV: "test",
				SUPERSET_HOME_DIR: "/tmp/isolated-home",
			}),
		).not.toThrow();
		expect(() =>
			assertIsolatedDaemonNamespaceInTests({ NODE_ENV: "production" }),
		).not.toThrow();
		expect(() =>
			assertIsolatedDaemonNamespaceInTests({ NODE_ENV: "development" }),
		).not.toThrow();
	});
});

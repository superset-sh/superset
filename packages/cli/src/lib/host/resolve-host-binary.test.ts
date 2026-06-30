import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { resolveHostBinary } from "./spawn";

/**
 * Reproduction for superset-sh/superset#5268 (secondary bug): the CLI
 * `superset start` cannot start the host service from the desktop app bundle.
 *
 * The standalone CLI tarball ships two files side by side (see
 * `packages/cli/scripts/build-dist.ts`):
 *   bin/superset        — Bun-compiled CLI binary
 *   bin/superset-host    — shell wrapper that runs the bundled host-service
 *
 * `resolveHostBinary()` therefore looks for a `superset-host` sibling next to
 * the running executable. The desktop app, however, bundles ONLY the unified
 * `…/resources/bin/superset` binary (see
 * `apps/desktop/src/main/lib/bundled-cli.ts`, which installs a shim that execs
 * `resources/bin/superset` and ships no `superset-host`). So when a user runs
 * the desktop-bundled `superset start`, the host binary cannot be resolved and
 * the command fails with:
 *
 *   Error: superset-host binary not found at …/resources/bin/superset-host.
 *
 * These tests pin that behaviour: given a desktop-style bundle that contains
 * only `superset`, the resolver points at a `superset-host` sibling that does
 * not exist on disk.
 */
const originalHostBin = process.env.SUPERSET_HOST_BIN;

describe("resolveHostBinary (repro #5268)", () => {
	let bundleBin: string;

	beforeEach(() => {
		// The env override short-circuits resolution; clear it so we exercise the
		// real sibling-lookup path that the desktop bundle hits.
		delete process.env.SUPERSET_HOST_BIN;
		bundleBin = mkdtempSync(join(tmpdir(), "superset-bundle-bin-"));
	});

	afterEach(() => {
		rmSync(bundleBin, { recursive: true, force: true });
	});

	afterAll(() => {
		if (originalHostBin === undefined) {
			delete process.env.SUPERSET_HOST_BIN;
		} else {
			process.env.SUPERSET_HOST_BIN = originalHostBin;
		}
	});

	test("standalone CLI tarball: superset-host sibling exists and resolves", () => {
		// Layout produced by build-dist.ts: both binaries live in bin/.
		const supersetBin = join(bundleBin, "superset");
		const hostBin = join(bundleBin, "superset-host");
		writeFileSync(supersetBin, "");
		writeFileSync(hostBin, "");

		const resolved = resolveHostBinary(supersetBin);

		expect(resolved).toBe(hostBin);
		expect(existsSync(resolved)).toBe(true);
	});

	test("desktop bundle: only `superset` is shipped, so superset-host is missing", () => {
		// Desktop bundle layout: resources/bin/superset only — no superset-host.
		const supersetBin = join(bundleBin, "superset");
		writeFileSync(supersetBin, "");

		const resolved = resolveHostBinary(supersetBin);

		// The resolver still points at a sibling that the bundle never ships,
		// which is exactly why `superset start` fails after `superset stop`.
		expect(resolved).toBe(join(dirname(supersetBin), "superset-host"));
		expect(existsSync(resolved)).toBe(false);
	});

	test("SUPERSET_HOST_BIN override wins over sibling lookup", () => {
		const override = join(bundleBin, "custom-host");
		writeFileSync(override, "");
		process.env.SUPERSET_HOST_BIN = override;

		expect(resolveHostBinary(join(bundleBin, "superset"))).toBe(override);
	});
});

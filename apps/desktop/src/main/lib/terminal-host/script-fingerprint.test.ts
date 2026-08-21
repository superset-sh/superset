/**
 * Regression test for issue #3611:
 * "dev-mode daemon rebuild wipes terminal & agent sessions on every app restart"
 *
 * Root cause: the client detected a stale daemon by comparing the daemon
 * script's *mtime*. `bun run dev` re-emits `dist/main/terminal-host.js` on every
 * relaunch, bumping its mtime even when the emitted bytes are identical — so the
 * mtime check fired on every restart, killing the daemon and destroying every
 * live PTY.
 *
 * These tests first demonstrate the buggy mtime behavior, then prove the
 * content-fingerprint approach only reports "stale" when the script's bytes
 * actually change.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	mkdtempSync,
	rmSync,
	statSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeScriptFingerprint, isScriptStale } from "./script-fingerprint";

// Mirror of the OLD, buggy mtime-based staleness check, kept here so the test
// can demonstrate the regression it caused.
function isStaleByMtime(savedMtime: string, scriptPath: string): boolean {
	const currentMtime = statSync(scriptPath).mtimeMs.toString();
	return savedMtime !== currentMtime;
}

describe("daemon script staleness (issue #3611)", () => {
	let dir: string;
	let scriptPath: string;
	const SCRIPT = "console.log('terminal-host daemon');\n";

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "script-fingerprint-"));
		scriptPath = join(dir, "terminal-host.js");
		writeFileSync(scriptPath, SCRIPT);
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	test("REPRODUCTION: mtime check reports stale after an identical rebuild", () => {
		const savedMtime = statSync(scriptPath).mtimeMs.toString();

		// Simulate a dev rebuild: identical bytes re-emitted, but mtime bumped.
		writeFileSync(scriptPath, SCRIPT);
		const later = new Date(Date.now() + 5000);
		utimesSync(scriptPath, later, later);

		// The old check kills the daemon even though nothing actually changed.
		expect(isStaleByMtime(savedMtime, scriptPath)).toBe(true);
	});

	test("FIX: content fingerprint is unchanged after an identical rebuild", () => {
		const savedFingerprint = computeScriptFingerprint(scriptPath);

		// Same dev rebuild: identical bytes, bumped mtime.
		writeFileSync(scriptPath, SCRIPT);
		const later = new Date(Date.now() + 5000);
		utimesSync(scriptPath, later, later);

		expect(isScriptStale(savedFingerprint, scriptPath)).toBe(false);
	});

	test("FIX: content fingerprint reports stale when the script actually changes", () => {
		const savedFingerprint = computeScriptFingerprint(scriptPath);

		writeFileSync(scriptPath, "console.log('new protocol');\n");

		expect(isScriptStale(savedFingerprint, scriptPath)).toBe(true);
	});

	test("no saved fingerprint is never stale (first run / manual cleanup)", () => {
		expect(isScriptStale(null, scriptPath)).toBe(false);
		expect(isScriptStale("", scriptPath)).toBe(false);
	});

	test("a missing script is never stale (don't restart on read error)", () => {
		const savedFingerprint = computeScriptFingerprint(scriptPath);
		rmSync(scriptPath);

		expect(computeScriptFingerprint(scriptPath)).toBeNull();
		expect(isScriptStale(savedFingerprint, scriptPath)).toBe(false);
	});
});

import { describe, expect, test } from "bun:test";
import {
	inspectProcessCommand,
	looksLikeHostProcess,
} from "./process-identity";

describe("inspectProcessCommand", () => {
	test("reads the command line of a live pid", async () => {
		const command = await inspectProcessCommand(process.pid);
		expect(command).not.toBeNull();
		// This is the test runner itself, never the host binary.
		expect(looksLikeHostProcess(command ?? "")).toBe(false);
	});

	test("returns null for a pid that isn't running", async () => {
		// High pid unlikely to be in use; process.kill(pid, 0) semantics apply
		// the same way ps does — an absent pid yields no output.
		const command = await inspectProcessCommand(999_999);
		expect(command).toBeNull();
	});
});

describe("looksLikeHostProcess", () => {
	test("matches a command that runs the host binary", () => {
		expect(looksLikeHostProcess("/opt/superset/bin/superset-host")).toBe(true);
	});

	test("does not match an unrelated command", () => {
		expect(looksLikeHostProcess("/usr/sbin/some-other-daemon")).toBe(false);
	});
});

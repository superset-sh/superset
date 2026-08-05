import { describe, expect, test } from "bun:test";
import {
	SIMPLE_GIT_UNSAFE_OPTION_FLAGS,
	USER_GIT_ENV_SIMPLE_GIT_OPTIONS,
} from "./simple-git-options";

const EXPECTED_SIMPLE_GIT_UNSAFE_OPTION_FLAGS = [
	"allowUnsafeAlias",
	"allowUnsafeAskPass",
	"allowUnsafeConfigEnvCount",
	"allowUnsafeConfigPaths",
	"allowUnsafeCredentialHelper",
	"allowUnsafeCustomBinary",
	"allowUnsafeDiffExternal",
	"allowUnsafeDiffTextConv",
	"allowUnsafeEditor",
	"allowUnsafeFilter",
	"allowUnsafeFsMonitor",
	"allowUnsafeGitProxy",
	"allowUnsafeGpgProgram",
	"allowUnsafeHooksPath",
	"allowUnsafeMergeDriver",
	"allowUnsafePack",
	"allowUnsafePager",
	"allowUnsafeProtocolOverride",
	"allowUnsafeSshCommand",
	"allowUnsafeTemplateDir",
] as const;

describe("simple-git unsafe options", () => {
	test("keeps the full simple-git unsafe option list explicit", () => {
		expect(SIMPLE_GIT_UNSAFE_OPTION_FLAGS).toEqual(
			EXPECTED_SIMPLE_GIT_UNSAFE_OPTION_FLAGS,
		);
	});

	test("enables every simple-git unsafe option", () => {
		expect(Object.keys(USER_GIT_ENV_SIMPLE_GIT_OPTIONS.unsafe)).toEqual([
			...EXPECTED_SIMPLE_GIT_UNSAFE_OPTION_FLAGS,
		]);
		for (const flag of EXPECTED_SIMPLE_GIT_UNSAFE_OPTION_FLAGS) {
			expect(USER_GIT_ENV_SIMPLE_GIT_OPTIONS.unsafe[flag]).toBe(true);
		}
	});
});

// Repro for #5898 "Importing projects freeze on mac": opening a folder runs
// getDefaultBranch(), which can reach a network git op (`ls-remote origin HEAD`).
// The shared simple-git options drive every git call in the desktop app, and
// without a `timeout.block` a git subprocess that stalls (unreachable remote,
// SSH host-key / credential prompt with no TTY) never gets killed, so the
// "open a folder" flow hangs indefinitely.
describe("simple-git hang guard (#5898)", () => {
	test("configures a positive block timeout so git ops cannot hang forever", () => {
		expect(USER_GIT_ENV_SIMPLE_GIT_OPTIONS.timeout).toBeDefined();
		expect(USER_GIT_ENV_SIMPLE_GIT_OPTIONS.timeout?.block).toBeGreaterThan(0);
		expect(
			Number.isFinite(USER_GIT_ENV_SIMPLE_GIT_OPTIONS.timeout?.block),
		).toBe(true);
	});
});

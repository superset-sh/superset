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

import { describe, expect, test } from "bun:test";
import { claudeProjectDirName } from "./claude";

describe("claudeProjectDirName", () => {
	// Expected values come from Claude Code 2.1.282's own encoder.
	test("replaces every non-alphanumeric character", () => {
		expect(
			claudeProjectDirName(
				"/Users/mason/.superset/worktrees/Super set/mason@feat_x",
			),
		).toBe("-Users-mason--superset-worktrees-Super-set-mason-feat-x");
	});

	test("encodes each UTF-16 code unit of a normalized path", () => {
		// Claude Code NFC-normalizes the path first: "e" + U+0301 is one "-".
		expect(claudeProjectDirName("/p/a_b c@\u00e9\u4e2d\u{1F600}")).toBe(
			"-p-a-b-c-----",
		);
		expect(claudeProjectDirName("/p/nfd-e\u0301x")).toBe("-p-nfd--x");
	});

	test("hashes only a name longer than 200 characters", () => {
		expect(claudeProjectDirName(`/${"a".repeat(199)}`)).toHaveLength(200);
		expect(claudeProjectDirName(`/${"a".repeat(200)}`)).toMatch(
			/^-a{199}-[0-9a-z]+$/,
		);
	});

	test("truncates a long path and appends Claude's hash of it", () => {
		const path = `/Users/mason/.superset/worktrees/${"a".repeat(180)}/feature_x`;
		const name = claudeProjectDirName(path);
		expect(name).toHaveLength(207);
		expect(name.endsWith("aaaaaaaaaa-2d2ous")).toBe(true);
	});
});

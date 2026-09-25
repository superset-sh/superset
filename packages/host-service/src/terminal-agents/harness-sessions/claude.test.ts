import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeProjectDirName, claudeSessionStore } from "./claude";

const created: string[] = [];

afterEach(() => {
	for (const path of created.splice(0)) {
		rmSync(path, { recursive: true, force: true });
	}
});

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

describe("claudeSessionStore.hasSession", () => {
	const sessionId = "44444444-5555-4666-8777-888899990000";

	function configWithProjects(count: number): string {
		const configDir = mkdtempSync(join(tmpdir(), "claude-scan-"));
		created.push(configDir);
		mkdirSync(join(configDir, "projects", claudeProjectDirName("/work/tree")), {
			recursive: true,
		});
		for (let i = 0; i < count; i++) {
			mkdirSync(join(configDir, "projects", `other-${i}`));
		}
		return configDir;
	}

	const ask = (configDir: string) =>
		claudeSessionStore.hasSession?.({
			sessionId,
			worktreePath: "/work/tree",
			env: { CLAUDE_CONFIG_DIR: configDir },
		});

	test("answers false only after searching every project directory", () => {
		expect(ask(configWithProjects(10))).toBe(false);
	});

	test("answers unknown when the search stopped at its cap", () => {
		expect(ask(configWithProjects(5_000))).toBeNull();
	});
});

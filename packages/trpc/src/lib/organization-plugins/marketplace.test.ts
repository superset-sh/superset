import { describe, expect, test } from "bun:test";
import {
	findManifestFile,
	findMarketplaceFile,
	parseMarketplace,
	pluginTreeFiles,
	skillsIn,
	withVersion,
} from "./marketplace";

describe("parseMarketplace", () => {
	test("reads Superset, Codex and Claude Code local sources", () => {
		const { entries, problems } = parseMarketplace(
			{
				plugins: [
					{ name: "ours", source: "./plugins/ours" },
					{
						name: "codex",
						source: { source: "local", path: "./plugins/codex" },
					},
				],
			},
			"",
		);
		expect(problems).toEqual([]);
		expect(entries.map(({ name, dir }) => ({ name, dir }))).toEqual([
			{ name: "ours", dir: "plugins/ours" },
			{ name: "codex", dir: "plugins/codex" },
		]);
	});

	test("resolves bare names under pluginRoot and paths under the source path", () => {
		const { entries } = parseMarketplace(
			{
				metadata: { pluginRoot: "./plugins" },
				plugins: [{ name: "a", source: "a" }],
			},
			"tools",
		);
		expect(entries.map((e) => e.dir)).toEqual(["tools/plugins/a"]);
	});

	test("refuses sources outside the repository", () => {
		const { entries, problems } = parseMarketplace(
			{
				plugins: [
					{ name: "remote", source: { source: "github", repo: "a/b" } },
					{ name: "escape", source: "./../secrets" },
				],
			},
			"",
		);
		expect(entries).toEqual([]);
		expect(problems.map((p) => p.name)).toEqual(["remote", "escape"]);
	});

	test("refuses a file with no plugins list", () => {
		expect(() => parseMarketplace({}, "")).toThrow("no plugins list");
	});
});

describe("repository paths", () => {
	const paths = new Set([
		".claude-plugin/marketplace.json",
		"plugins/a/.codex-plugin/plugin.json",
		"plugins/a/skills/triage/SKILL.md",
		"plugins/a/commands/ship.md",
		"plugins/a/node_modules/x/index.js",
		"plugins/a/README.md",
		"plugins/ab/skills/other/SKILL.md",
	]);

	test("finds the marketplace and manifest files in any supported location", () => {
		expect(findMarketplaceFile(paths, "")).toBe(
			".claude-plugin/marketplace.json",
		);
		expect(findManifestFile(paths, "plugins/a")).toBe(
			"plugins/a/.codex-plugin/plugin.json",
		);
	});

	test("carries only skills and commands, and only from the plugin's own directory", () => {
		expect([...pluginTreeFiles(paths, "plugins/a")]).toEqual([
			["plugins/a/skills/triage/SKILL.md", "skills/triage/SKILL.md"],
			["plugins/a/commands/ship.md", "commands/ship.md"],
		]);
	});
});

describe("withVersion", () => {
	const files = new Map([["skills/a/SKILL.md", Buffer.from("one")]]);

	test("keeps a declared version", () => {
		expect(withVersion({ name: "a", version: "1.2.0" }, files).version).toBe(
			"1.2.0",
		);
	});

	test("derives a missing version from the content", () => {
		const first = withVersion({ name: "a" }, files).version;
		expect(withVersion({ name: "a" }, files).version).toBe(first);
		expect(
			withVersion(
				{ name: "a" },
				new Map([["skills/a/SKILL.md", Buffer.from("two")]]),
			).version,
		).not.toBe(first);
	});
});

describe("skillsIn", () => {
	test("names skills from their frontmatter, falling back to the directory", () => {
		const files = new Map([
			[
				"skills/triage/SKILL.md",
				Buffer.from(
					'---\nname: triage\ndescription: "Sort new issues"\n---\nBody',
				),
			],
			["skills/bare/SKILL.md", Buffer.from("No frontmatter")],
			["commands/ship.md", Buffer.from("x")],
		]);
		expect(skillsIn(files)).toEqual([
			{ name: "bare", description: "" },
			{ name: "triage", description: "Sort new issues" },
		]);
	});
});

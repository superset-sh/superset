import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { getBundledPluginDir } from "./config";

/**
 * Keeps every bundled plugin skill within the Agent Skills spec
 * (https://agentskills.io/specification) and Anthropic's authoring guidance,
 * since these ship to every agent a user runs through Superset.
 */

const SKILLS_DIR = path.join(getBundledPluginDir(), "skills");
const SPEC_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SPEC_KEYS = new Set([
	"name",
	"description",
	"license",
	"compatibility",
	"metadata",
	"allowed-tools",
]);
// Claude Code extensions we deliberately use; anything else is a typo.
const HOST_KEYS = new Set(["argument-hint"]);
const MAX_DESCRIPTION_CHARS = 1024;
const MAX_BODY_LINES = 500;

interface ParsedSkill {
	frontmatter: Record<string, string>;
	body: string;
}

function parseSkill(content: string): ParsedSkill {
	expect(content.startsWith("---\n")).toBe(true);
	const end = content.indexOf("\n---\n", 4);
	expect(end).toBeGreaterThan(0);
	const frontmatter: Record<string, string> = {};
	for (const line of content.slice(4, end).split("\n")) {
		if (line.trim() === "") continue;
		const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
		// Every frontmatter line must be a top-level `key: value`.
		expect(match, `unparseable frontmatter line: ${line}`).not.toBeNull();
		if (!match) continue;
		const [, key, raw] = match;
		frontmatter[key] = raw.replace(/^"(.*)"$/, "$1");
	}
	return { frontmatter, body: content.slice(end + "\n---\n".length) };
}

const skillDirs = readdirSync(SKILLS_DIR).filter((name) =>
	statSync(path.join(SKILLS_DIR, name)).isDirectory(),
);

describe("bundled plugin skills", () => {
	it("finds the bundled skills", () => {
		expect(skillDirs.length).toBeGreaterThan(0);
	});

	for (const dir of skillDirs) {
		describe(dir, () => {
			const skillPath = path.join(SKILLS_DIR, dir, "SKILL.md");
			const content = readFileSync(skillPath, "utf-8");
			const { frontmatter, body } = parseSkill(content);

			it("uses a spec-valid name that matches its directory", () => {
				expect(frontmatter.name).toBe(dir);
				expect(frontmatter.name).toMatch(SPEC_NAME);
				expect(frontmatter.name.length).toBeLessThanOrEqual(64);
			});

			it("has a description that says what and when, within the limit", () => {
				const description = frontmatter.description ?? "";
				expect(description.length).toBeGreaterThan(0);
				expect(description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS);
				expect(description).toMatch(/\bUse when\b/);
				expect(description).not.toMatch(/<[a-z]+>/);
			});

			it("only uses known frontmatter keys", () => {
				for (const key of Object.keys(frontmatter)) {
					expect(SPEC_KEYS.has(key) || HOST_KEYS.has(key)).toBe(true);
				}
			});

			it("keeps the body within the progressive-disclosure budget", () => {
				expect(body.split("\n").length).toBeLessThanOrEqual(MAX_BODY_LINES);
			});

			it("avoids em dashes (repo prose rule)", () => {
				expect(content.includes("—")).toBe(false);
			});

			it("ships every script and reference it mentions", () => {
				const referenced = new Set<string>();
				for (const match of body.matchAll(
					/`(?:\$\{CLAUDE_SKILL_DIR\}\/)?((?:scripts|references)\/[A-Za-z0-9_./-]+)`/g,
				)) {
					referenced.add(match[1]);
				}
				for (const rel of referenced) {
					const abs = path.join(SKILLS_DIR, dir, rel);
					expect(existsSync(abs)).toBe(true);
					if (rel.startsWith("scripts/")) {
						expect(statSync(abs).mode & 0o111).not.toBe(0);
					}
				}
			});

			it("has Codex interface metadata", () => {
				const yamlPath = path.join(SKILLS_DIR, dir, "agents", "openai.yaml");
				expect(existsSync(yamlPath)).toBe(true);
				const yaml = readFileSync(yamlPath, "utf-8");
				expect(yaml).toMatch(/^interface:\n/);
				for (const key of [
					"display_name",
					"short_description",
					"default_prompt",
				]) {
					expect(yaml).toMatch(new RegExp(`^  ${key}: "[^"\\n]+"$`, "m"));
				}
			});
		});
	}
});

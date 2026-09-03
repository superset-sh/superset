import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MANAGED_SKILL_MARKER } from "@superset/agent-setup";
import { getBundledPluginDir } from "@superset/agent-setup/config";
import { resolveCreatePrSkill, stripSkillFrontmatter } from "./create-pr-skill";

async function writeSkill(dir: string, body: string): Promise<string> {
	await mkdir(dir, { recursive: true });
	const file = join(dir, "SKILL.md");
	await writeFile(file, body);
	return file;
}

describe("stripSkillFrontmatter", () => {
	test("drops frontmatter and the managed marker", () => {
		const content = `---\nname: create-pr\ndescription: x\n---\n${MANAGED_SKILL_MARKER}\n# Title\n\nBody\n`;
		expect(stripSkillFrontmatter(content)).toBe("# Title\n\nBody");
	});

	test("leaves a file without frontmatter alone", () => {
		expect(stripSkillFrontmatter("# Just body\n")).toBe("# Just body");
	});
});

describe("resolveCreatePrSkill", () => {
	let root: string;
	let worktree: string;
	let home: string;
	let bundled: string;

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), "create-pr-skill-test-"));
		worktree = join(root, "worktree");
		home = join(root, "home");
		bundled = join(root, "plugin");
		await mkdir(worktree, { recursive: true });
		await writeSkill(
			join(bundled, "skills", "create-pr"),
			"---\nname: create-pr\n---\nbundled body\n",
		);
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test("falls back to the bundled skill", async () => {
		const skill = await resolveCreatePrSkill({
			worktreePath: worktree,
			homeDir: home,
			bundledPluginDir: bundled,
		});
		expect(skill).toEqual({
			source: "bundled",
			path: join(bundled, "skills", "create-pr", "SKILL.md"),
			body: "bundled body",
		});
	});

	test("the user's provisioned copy beats the bundle", async () => {
		const file = await writeSkill(
			join(home, ".agents", "skills", "superset-create-pr"),
			`---\nname: superset-create-pr\n---\n${MANAGED_SKILL_MARKER}\nuser body\n`,
		);
		const skill = await resolveCreatePrSkill({
			worktreePath: worktree,
			homeDir: home,
			bundledPluginDir: bundled,
		});
		expect(skill).toEqual({ source: "user", path: file, body: "user body" });
	});

	test("the project's own skill beats both", async () => {
		await writeSkill(
			join(home, ".agents", "skills", "superset-create-pr"),
			"user body\n",
		);
		const file = await writeSkill(
			join(worktree, ".agents", "skills", "create-pr"),
			"---\nname: create-pr\n---\nproject body\n",
		);
		const skill = await resolveCreatePrSkill({
			worktreePath: worktree,
			homeDir: home,
			bundledPluginDir: bundled,
		});
		expect(skill).toEqual({
			source: "project",
			path: file,
			body: "project body",
		});
	});

	test("a .claude/skills override counts as the project's", async () => {
		const file = await writeSkill(
			join(worktree, ".claude", "skills", "create-pr"),
			"claude project body\n",
		);
		const skill = await resolveCreatePrSkill({
			worktreePath: worktree,
			homeDir: home,
			bundledPluginDir: bundled,
		});
		expect(skill?.source).toBe("project");
		expect(skill?.path).toBe(file);
	});

	test("an empty override is skipped", async () => {
		await writeSkill(
			join(worktree, ".agents", "skills", "create-pr"),
			"---\nname: create-pr\n---\n\n",
		);
		const skill = await resolveCreatePrSkill({
			worktreePath: worktree,
			homeDir: home,
			bundledPluginDir: bundled,
		});
		expect(skill?.source).toBe("bundled");
	});

	test("null when even the bundle is missing", async () => {
		rmSync(bundled, { recursive: true, force: true });
		expect(
			await resolveCreatePrSkill({
				worktreePath: worktree,
				homeDir: home,
				bundledPluginDir: bundled,
			}),
		).toBeNull();
	});

	test("the real bundle ships a create-pr skill", async () => {
		const skill = await resolveCreatePrSkill({
			worktreePath: worktree,
			homeDir: home,
			bundledPluginDir: getBundledPluginDir(),
		});
		expect(skill?.source).toBe("bundled");
		expect(skill?.body).toContain("gh pr create");
	});
});

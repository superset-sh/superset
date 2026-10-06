import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	isValidSkillName,
	slugifySkillName,
	titleCaseSkillName,
} from "@superset/shared/skills";
import { MANAGED_SKILL_MARKER } from "./managed-skills";
import {
	createUserSkill,
	deleteUserSkill,
	findSkillRoot,
	importUserSkill,
	linkedSkillRoots,
	listUserSkills,
	parseSkillFrontmatter,
	parseSkillInterface,
	readSkillMetadata,
	SkillExistsError,
	SkillNameError,
	SkillSourceError,
	skillRootsUnder,
	writableSkillRoot,
} from "./user-skills";

const TEST_ROOT = path.join(
	os.tmpdir(),
	`superset-user-skills-${process.pid}-${Date.now()}`,
);
const HOME = path.join(TEST_ROOT, "home");
const agentsSkills = path.join(HOME, ".agents", "skills");
const claudeSkills = path.join(HOME, ".claude", "skills");
const codexSkills = path.join(HOME, ".codex", "skills");

function skillMd(name: string, description = `test ${name} skill`): string {
	return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;
}

function seedSkill(root: string, name: string, extra?: Record<string, string>) {
	const dir = path.join(root, name);
	mkdirSync(dir, { recursive: true });
	writeFileSync(path.join(dir, "SKILL.md"), skillMd(name));
	for (const [relative, contents] of Object.entries(extra ?? {})) {
		mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true });
		writeFileSync(path.join(dir, relative), contents);
	}
	return dir;
}

beforeEach(() => {
	mkdirSync(agentsSkills, { recursive: true });
	mkdirSync(claudeSkills, { recursive: true });
	mkdirSync(codexSkills, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe("skill roots", () => {
	it("lists the three config dirs with .agents first and writes there", () => {
		expect(skillRootsUnder(HOME)).toEqual([
			agentsSkills,
			claudeSkills,
			codexSkills,
		]);
		expect(writableSkillRoot(HOME)).toBe(agentsSkills);
	});
});

describe("listUserSkills", () => {
	it("merges roots, folds symlinked copies into linkedFrom and reads Codex UI metadata", () => {
		seedSkill(agentsSkills, "alpha", {
			"agents/openai.yaml": [
				"interface:",
				'  display_name: "Alpha Prime"',
				"  short_description: 'One-line alpha'",
				'  brand_color: "#3B82F6"',
				"  icon_small: ./assets/icon.svg",
				"",
			].join("\n"),
			"assets/icon.svg": "<svg/>",
		});
		symlinkSync(
			path.join("..", "..", ".agents", "skills", "alpha"),
			path.join(claudeSkills, "alpha"),
		);
		seedSkill(claudeSkills, "beta");

		const skills = listUserSkills(skillRootsUnder(HOME), "personal");

		expect(skills.map((skill) => skill.name)).toEqual(["alpha", "beta"]);
		const [alpha, beta] = skills;
		expect(alpha?.dir).toBe(path.join(agentsSkills, "alpha"));
		expect(alpha?.linkedFrom).toEqual([path.join(claudeSkills, "alpha")]);
		expect(alpha?.displayName).toBe("Alpha Prime");
		expect(alpha?.shortDescription).toBe("One-line alpha");
		expect(alpha?.brandColor).toBe("#3B82F6");
		expect(alpha?.iconPath).toBe(
			path.join(agentsSkills, "alpha", "assets", "icon.svg"),
		);
		expect(alpha?.description).toBe("test alpha skill");
		expect(alpha?.scope).toBe("personal");
		expect(beta?.displayName).toBe("Beta");
		expect(beta?.shortDescription).toBeNull();
		expect(beta?.iconPath).toBeNull();
	});

	it("skips hidden dirs, folders without SKILL.md and Superset-managed copies", () => {
		seedSkill(path.join(codexSkills, ".system"), "builtin");
		mkdirSync(path.join(agentsSkills, "not-a-skill"), { recursive: true });
		const managed = seedSkill(agentsSkills, "superset-doctor");
		writeFileSync(
			path.join(managed, "SKILL.md"),
			`---\nname: superset-doctor\ndescription: managed\n---\n${MANAGED_SKILL_MARKER}\n`,
		);
		seedSkill(agentsSkills, "mine");

		const skills = listUserSkills(skillRootsUnder(HOME), "personal");
		expect(skills.map((skill) => skill.name)).toEqual(["mine"]);
	});

	it("tolerates a root that does not exist", () => {
		expect(
			listUserSkills([path.join(TEST_ROOT, "missing", "skills")], "project"),
		).toEqual([]);
	});

	it("uses the icon file in the skill folder when the yaml names none", () => {
		seedSkill(agentsSkills, "painted", { "icon.png": "png" });
		const [skill] = listUserSkills([agentsSkills], "personal");
		expect(skill?.iconPath).toBe(
			path.join(agentsSkills, "painted", "icon.png"),
		);
	});
});

describe("frontmatter and interface parsing", () => {
	it("reads plain, quoted and folded descriptions", () => {
		expect(
			parseSkillFrontmatter(skillMd("x", "Plain text: with colon")),
		).toEqual({ name: "x", description: "Plain text: with colon" });
		expect(
			parseSkillFrontmatter(
				'---\nname: "quoted"\ndescription: "Use when \\"needed\\""\n---\n',
			),
		).toEqual({ name: "quoted", description: 'Use when "needed"' });
		expect(
			parseSkillFrontmatter(
				"---\nname: folded\ndescription: >\n  first line\n  second line\nmetadata:\n  short-description: nested\n---\n",
			),
		).toEqual({ name: "folded", description: "first line second line" });
		expect(parseSkillFrontmatter("# no frontmatter\n")).toEqual({
			name: null,
			description: "",
		});
	});

	it("reads only the interface block of openai.yaml", () => {
		const parsed = parseSkillInterface(
			[
				"policy:",
				"  allow_implicit_invocation: false",
				"interface:",
				'  display_name: "Decide Together"',
				'  default_prompt: "Use $decide"',
				"dependencies:",
				"  tools: []",
			].join("\n"),
		);
		expect(parsed.displayName).toBe("Decide Together");
		expect(parsed.defaultPrompt).toBe("Use $decide");
		expect(parsed.shortDescription).toBeNull();
		expect(parseSkillInterface("").displayName).toBeNull();
	});
});

describe("names", () => {
	it("validates and derives names", () => {
		expect(isValidSkillName("cdp-verification")).toBe(true);
		expect(isValidSkillName("10x")).toBe(true);
		expect(isValidSkillName("Bad Name")).toBe(false);
		expect(isValidSkillName("-leading")).toBe(false);
		expect(isValidSkillName("double--dash")).toBe(false);
		expect(isValidSkillName("a".repeat(65))).toBe(false);
		expect(titleCaseSkillName("cdp-verification")).toBe("Cdp Verification");
		expect(slugifySkillName("My Skill!")).toBe("my-skill");
	});
});

describe("createUserSkill", () => {
	it("writes a SKILL.md with frontmatter the agents can match on", () => {
		const { dir, skillPath } = createUserSkill({
			rootDir: agentsSkills,
			name: "release-notes",
			description:
				'Draft release notes: use when asked to "write the changelog"',
		});
		expect(dir).toBe(path.join(agentsSkills, "release-notes"));
		const written = readFileSync(skillPath, "utf-8");
		expect(written.startsWith("---\nname: release-notes\n")).toBe(true);
		expect(parseSkillFrontmatter(written)).toEqual({
			name: "release-notes",
			description:
				'Draft release notes: use when asked to "write the changelog"',
		});
		expect(written).toContain("# Release Notes");
	});

	it("links the skill from .claude/skills, relative like the repo's own links", () => {
		const created = createUserSkill({
			rootDir: agentsSkills,
			name: "linked",
			description: "x",
			linkRoots: linkedSkillRoots(HOME),
		});
		const link = path.join(claudeSkills, "linked");
		expect(created.linkedFrom).toEqual([link]);
		expect(lstatSync(link).isSymbolicLink()).toBe(true);
		expect(readlinkSync(link)).toBe(
			path.join("..", "..", ".agents", "skills", "linked"),
		);
		expect(
			listUserSkills(skillRootsUnder(HOME), "personal")[0]?.linkedFrom,
		).toEqual([link]);
	});

	it("skips the link when .claude/skills already resolves to .agents/skills", () => {
		rmSync(claudeSkills, { recursive: true, force: true });
		symlinkSync(path.join("..", ".agents", "skills"), claudeSkills);
		const created = createUserSkill({
			rootDir: agentsSkills,
			name: "shared",
			description: "x",
			linkRoots: linkedSkillRoots(HOME),
		});
		expect(created.linkedFrom).toEqual([]);
		expect(listUserSkills(skillRootsUnder(HOME), "personal")).toHaveLength(1);
	});

	it("leaves an entry the user already has at the link path alone", () => {
		seedSkill(claudeSkills, "taken");
		const created = createUserSkill({
			rootDir: agentsSkills,
			name: "taken",
			description: "x",
			linkRoots: linkedSkillRoots(HOME),
		});
		expect(created.linkedFrom).toEqual([]);
		expect(lstatSync(path.join(claudeSkills, "taken")).isSymbolicLink()).toBe(
			false,
		);
	});

	it("rejects invalid names and existing folders", () => {
		expect(() =>
			createUserSkill({ rootDir: agentsSkills, name: "Nope", description: "" }),
		).toThrow(SkillNameError);
		seedSkill(agentsSkills, "taken");
		expect(() =>
			createUserSkill({
				rootDir: agentsSkills,
				name: "taken",
				description: "",
			}),
		).toThrow(SkillExistsError);
	});
});

describe("importUserSkill", () => {
	it("copies the folder under a slug and renames the frontmatter to match", () => {
		const source = path.join(TEST_ROOT, "Downloads", "My Skill");
		mkdirSync(path.join(source, "scripts"), { recursive: true });
		writeFileSync(path.join(source, "SKILL.md"), skillMd("My Skill"));
		writeFileSync(path.join(source, "scripts", "run.sh"), "echo hi\n");

		const imported = importUserSkill({
			sourceDir: source,
			rootDir: agentsSkills,
		});

		expect(imported).toMatchObject({
			dir: path.join(agentsSkills, "my-skill"),
			name: "my-skill",
			linkedFrom: [],
		});
		expect(
			parseSkillFrontmatter(
				readFileSync(path.join(imported.dir, "SKILL.md"), "utf-8"),
			).name,
		).toBe("my-skill");
		expect(existsSync(path.join(imported.dir, "scripts", "run.sh"))).toBe(true);
	});

	it("refuses folders without SKILL.md", () => {
		const source = path.join(TEST_ROOT, "plain");
		mkdirSync(source, { recursive: true });
		expect(() =>
			importUserSkill({ sourceDir: source, rootDir: agentsSkills }),
		).toThrow(SkillSourceError);
	});
});

describe("deleteUserSkill", () => {
	it("removes the real folder and the links that pointed at it", () => {
		seedSkill(agentsSkills, "gone");
		symlinkSync(
			path.join("..", "..", ".agents", "skills", "gone"),
			path.join(claudeSkills, "gone"),
		);
		const [skill] = listUserSkills(skillRootsUnder(HOME), "personal");
		expect(skill?.linkedFrom).toHaveLength(1);

		deleteUserSkill(skill as NonNullable<typeof skill>);

		expect(existsSync(path.join(agentsSkills, "gone"))).toBe(false);
		expect(() => lstatSync(path.join(claudeSkills, "gone"))).toThrow();
	});

	it("deletes the target when asked through the link", () => {
		seedSkill(agentsSkills, "linked");
		symlinkSync(
			path.join("..", "..", ".agents", "skills", "linked"),
			path.join(claudeSkills, "linked"),
		);
		deleteUserSkill({ dir: path.join(claudeSkills, "linked"), linkedFrom: [] });
		expect(existsSync(path.join(agentsSkills, "linked"))).toBe(false);
		expect(() => lstatSync(path.join(claudeSkills, "linked"))).toThrow();
	});
});

describe("readSkillMetadata", () => {
	it("reads a bundled source directory the same way as a user skill", () => {
		const dir = seedSkill(path.join(TEST_ROOT, "plugin", "skills"), "doctor", {
			"agents/openai.yaml": 'interface:\n  display_name: "Superset Doctor"\n',
			"icon.svg": "<svg/>",
		});
		expect(readSkillMetadata(dir)).toEqual({
			displayName: "Superset Doctor",
			description: "test doctor skill",
			shortDescription: null,
			iconPath: path.join(dir, "icon.svg"),
			brandColor: null,
		});
		expect(readSkillMetadata(path.join(TEST_ROOT, "nowhere"))).toBeNull();
	});
});

describe("findSkillRoot", () => {
	it("accepts direct children of a root and nothing else", () => {
		const roots = skillRootsUnder(HOME);
		expect(findSkillRoot(path.join(agentsSkills, "mine"), roots)).toBe(
			agentsSkills,
		);
		expect(
			findSkillRoot(path.join(agentsSkills, "mine", "nested"), roots),
		).toBeNull();
		expect(
			findSkillRoot(path.join(agentsSkills, "mine", "..", "..", "etc"), roots),
		).toBeNull();
		expect(findSkillRoot(path.join(agentsSkills, ".hidden"), roots)).toBeNull();
		expect(
			findSkillRoot(path.join(TEST_ROOT, "elsewhere", "mine"), roots),
		).toBeNull();
	});
});

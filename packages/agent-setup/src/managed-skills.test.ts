import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	createManagedSkills,
	MANAGED_SENTINEL_NAME,
	MANAGED_SKILL_MARKER,
	setFrontmatterName,
	withManagedMarker,
} from "./managed-skills";

const TEST_ROOT = path.join(
	os.tmpdir(),
	`superset-managed-skills-${process.pid}-${Date.now()}`,
);
const HOME_DIR = path.join(TEST_ROOT, "home");
const TEMPLATES_DIR = path.join(TEST_ROOT, "templates");
const BUNDLED_PLUGIN = path.join(TEMPLATES_DIR, "plugin");

const claudeSkills = path.join(HOME_DIR, ".claude", "skills");
const claudePlugin = path.join(claudeSkills, "superset");
const agentsSkills = path.join(HOME_DIR, ".agents", "skills");
const commandsDir = path.join(HOME_DIR, ".agents", "commands", "superset");

function skillMd(name: string): string {
	return `---\nname: ${name}\ndescription: test ${name} skill\n---\n\n# ${name} body\n`;
}

function seedBundledPlugin(): void {
	mkdirSync(path.join(BUNDLED_PLUGIN, ".claude-plugin"), { recursive: true });
	writeFileSync(
		path.join(BUNDLED_PLUGIN, ".claude-plugin", "plugin.json"),
		JSON.stringify({ name: "superset", version: "0.3.0" }),
	);
	for (const name of ["feedback", "10x", "orchestrate"]) {
		const dir = path.join(BUNDLED_PLUGIN, "skills", name);
		mkdirSync(dir, { recursive: true });
		writeFileSync(path.join(dir, "SKILL.md"), skillMd(name));
	}
	const agentsExtra = path.join(
		BUNDLED_PLUGIN,
		"skills",
		"orchestrate",
		"agents",
	);
	mkdirSync(agentsExtra, { recursive: true });
	writeFileSync(path.join(agentsExtra, "openai.yaml"), "model: test\n");
}

async function run(disabledSkills?: readonly string[]): Promise<void> {
	await createManagedSkills({
		homeDir: HOME_DIR,
		templatesDir: TEMPLATES_DIR,
		disabledSkills,
	});
}

beforeEach(() => {
	rmSync(TEST_ROOT, { recursive: true, force: true });
	seedBundledPlugin();
	mkdirSync(HOME_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe("withManagedMarker", () => {
	it("inserts the marker after the frontmatter block", () => {
		const marked = withManagedMarker(skillMd("feedback"));
		const lines = marked.split("\n");
		expect(lines[lines.indexOf("---", 1) + 1]).toBe(MANAGED_SKILL_MARKER);
	});

	it("is idempotent", () => {
		const marked = withManagedMarker(skillMd("feedback"));
		expect(withManagedMarker(marked)).toBe(marked);
	});
});

describe("setFrontmatterName", () => {
	it("rewrites only the frontmatter name", () => {
		const renamed = setFrontmatterName(
			skillMd("feedback"),
			"superset-feedback",
		);
		expect(renamed).toContain("name: superset-feedback");
		expect(renamed).toContain("# feedback body");
	});
});

describe("createManagedSkills", () => {
	it("provisions the Claude skills-directory plugin verbatim with a sentinel", async () => {
		await run();

		expect(
			JSON.parse(
				readFileSync(
					path.join(claudePlugin, ".claude-plugin", "plugin.json"),
					"utf-8",
				),
			).name,
		).toBe("superset");
		for (const name of ["feedback", "10x", "orchestrate"]) {
			expect(
				readFileSync(
					path.join(claudePlugin, "skills", name, "SKILL.md"),
					"utf-8",
				),
			).toContain(`name: ${name}`);
		}
		expect(
			existsSync(
				path.join(
					claudePlugin,
					"skills",
					"orchestrate",
					"agents",
					"openai.yaml",
				),
			),
		).toBe(true);
		expect(existsSync(path.join(claudePlugin, MANAGED_SENTINEL_NAME))).toBe(
			true,
		);
	});

	it("provisions prefixed skill dirs for other agents with rewritten names", async () => {
		await run();

		for (const dirName of [
			"superset-feedback",
			"superset-10x",
			"superset-orchestrate",
		]) {
			const content = readFileSync(
				path.join(agentsSkills, dirName, "SKILL.md"),
				"utf-8",
			);
			expect(content).toContain(`name: ${dirName}`);
			expect(content).toContain(MANAGED_SKILL_MARKER);
		}
		expect(
			existsSync(
				path.join(
					agentsSkills,
					"superset-orchestrate",
					"agents",
					"openai.yaml",
				),
			),
		).toBe(true);
	});

	it("provisions in-app commands for feedback and 10x only", async () => {
		await run();

		for (const file of ["feedback.md", "10x.md"]) {
			expect(readFileSync(path.join(commandsDir, file), "utf-8")).toContain(
				MANAGED_SKILL_MARKER,
			);
		}
		expect(existsSync(path.join(commandsDir, "orchestrate.md"))).toBe(false);
	});

	it("never touches a user-owned plugin dir or files without markers", async () => {
		mkdirSync(claudePlugin, { recursive: true });
		writeFileSync(path.join(claudePlugin, "SKILL.md"), "users own plugin\n");
		const userSkill = path.join(agentsSkills, "superset-feedback", "SKILL.md");
		mkdirSync(path.dirname(userSkill), { recursive: true });
		writeFileSync(userSkill, "my own skill\n");

		await run();

		expect(readFileSync(path.join(claudePlugin, "SKILL.md"), "utf-8")).toBe(
			"users own plugin\n",
		);
		expect(existsSync(path.join(claudePlugin, "skills"))).toBe(false);
		expect(readFileSync(userSkill, "utf-8")).toBe("my own skill\n");
	});

	it("reaps stale managed dirs from earlier versions but keeps user dirs", async () => {
		const staleClaude = path.join(claudeSkills, "superset-feedback");
		mkdirSync(staleClaude, { recursive: true });
		writeFileSync(
			path.join(staleClaude, "SKILL.md"),
			withManagedMarker(skillMd("superset-feedback")),
		);
		const staleAgents = path.join(agentsSkills, "superset-orchestration");
		mkdirSync(staleAgents, { recursive: true });
		writeFileSync(
			path.join(staleAgents, "SKILL.md"),
			withManagedMarker(skillMd("superset-orchestration")),
		);
		const userDir = path.join(claudeSkills, "decide");
		mkdirSync(userDir, { recursive: true });
		writeFileSync(path.join(userDir, "SKILL.md"), "mine\n");

		await run();

		expect(existsSync(staleClaude)).toBe(false);
		expect(existsSync(staleAgents)).toBe(false);
		expect(existsSync(path.join(userDir, "SKILL.md"))).toBe(true);
	});

	it("automatically ships any skill added to the bundled plugin", async () => {
		const extraDir = path.join(BUNDLED_PLUGIN, "skills", "newskill");
		mkdirSync(extraDir, { recursive: true });
		writeFileSync(path.join(extraDir, "SKILL.md"), skillMd("newskill"));

		await run();

		expect(
			readFileSync(
				path.join(agentsSkills, "superset-newskill", "SKILL.md"),
				"utf-8",
			),
		).toContain("name: superset-newskill");
		expect(
			existsSync(path.join(claudePlugin, "skills", "newskill", "SKILL.md")),
		).toBe(true);
	});

	it("removes files from the plugin dir that left the bundle", async () => {
		await run();
		const removed = path.join(BUNDLED_PLUGIN, "skills", "10x");
		rmSync(removed, { recursive: true });

		await run();

		expect(existsSync(path.join(claudePlugin, "skills", "10x"))).toBe(false);
		expect(existsSync(path.join(claudePlugin, "skills", "feedback"))).toBe(
			true,
		);
	});

	it("withholds a disabled skill from every surface and reaps it if already provisioned", async () => {
		await run();
		expect(existsSync(path.join(agentsSkills, "superset-feedback"))).toBe(true);

		await run(["feedback"]);

		expect(existsSync(path.join(agentsSkills, "superset-feedback"))).toBe(
			false,
		);
		expect(existsSync(path.join(commandsDir, "feedback.md"))).toBe(false);
		expect(existsSync(path.join(claudePlugin, "skills", "feedback"))).toBe(
			false,
		);
		// Untouched skills stay provisioned.
		expect(existsSync(path.join(agentsSkills, "superset-10x"))).toBe(true);
		expect(readFileSync(path.join(commandsDir, "10x.md"), "utf-8")).toContain(
			MANAGED_SKILL_MARKER,
		);
		expect(existsSync(path.join(claudePlugin, "skills", "10x"))).toBe(true);
	});
});

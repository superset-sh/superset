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
	type PluginSkillSource,
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

const SUPERSET_HOME = path.join(TEST_ROOT, "superset");

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

async function run(
	disabledSkills?: readonly string[],
	pluginSources?: readonly PluginSkillSource[],
): Promise<void> {
	await createManagedSkills({
		homeDir: HOME_DIR,
		templatesDir: TEMPLATES_DIR,
		disabledSkills,
		pluginSources,
	});
}

function seedMarketplacePlugin(
	name: string,
	skills: readonly string[],
): PluginSkillSource {
	const dir = path.join(TEST_ROOT, "marketplace", name);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		path.join(dir, "plugin.json"),
		JSON.stringify({
			name,
			version: "1.2.3",
			description: `${name} plugin`,
			license: "MIT",
		}),
	);
	for (const skill of skills) {
		const skillDir = path.join(dir, "skills", skill);
		mkdirSync(skillDir, { recursive: true });
		writeFileSync(path.join(skillDir, "SKILL.md"), skillMd(skill));
	}
	mkdirSync(path.join(dir, "server"), { recursive: true });
	writeFileSync(path.join(dir, "server", "index.mjs"), "export const run = 1;");
	return { name, dir };
}

/**
 * The ledger this file writes and reads. Named explicitly rather than resolved
 * from SUPERSET_HOME_DIR: sibling files in the same process move that variable
 * in their own hooks, and one landing between this write and the read under
 * test sends the reader to a home with no ledger in it.
 */
const INSTALLED_PLUGINS_FILE = path.join(
	SUPERSET_HOME,
	"plugins",
	"installed_plugins.json",
);

function writeInstalledPlugins(
	plugins: readonly Record<string, unknown>[],
): void {
	const dir = path.join(SUPERSET_HOME, "plugins");
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		path.join(dir, "installed_plugins.json"),
		JSON.stringify({ version: 1, plugins }),
	);
}

beforeEach(() => {
	rmSync(TEST_ROOT, { recursive: true, force: true });
	seedBundledPlugin();
	mkdirSync(HOME_DIR, { recursive: true });
	process.env.SUPERSET_HOME_DIR = SUPERSET_HOME;
});

afterEach(() => {
	delete process.env.SUPERSET_HOME_DIR;
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

describe("createManagedSkills with plugin sources", () => {
	it("grafts a marketplace plugin into the one Superset plugin dir", async () => {
		const github = seedMarketplacePlugin("github", ["issue-triage"]);
		await run(undefined, [github]);

		expect(existsSync(path.join(claudeSkills, "github"))).toBe(false);
		const claudeSkill = readFileSync(
			path.join(claudePlugin, "skills", "github-issue-triage", "SKILL.md"),
			"utf-8",
		);
		expect(claudeSkill).toContain("name: github-issue-triage");

		const shared = readFileSync(
			path.join(agentsSkills, "github-issue-triage", "SKILL.md"),
			"utf-8",
		);
		expect(shared).toContain("name: github-issue-triage");
		expect(shared).toContain(MANAGED_SKILL_MARKER);
	});

	it("keeps non-skill payload out of the Claude plugin dir", async () => {
		const linear = seedMarketplacePlugin("linear", ["triage"]);
		await run(undefined, [linear]);

		expect(existsSync(path.join(claudePlugin, "server"))).toBe(false);
		expect(existsSync(path.join(claudePlugin, "skills", "server"))).toBe(false);
		expect(existsSync(path.join(claudePlugin, "skills", "linear-triage"))).toBe(
			true,
		);
	});

	it("leaves the bundled plugin alone and reaps only uninstalled plugins", async () => {
		const github = seedMarketplacePlugin("github", ["issue-triage"]);
		await run(undefined, [github]);
		expect(existsSync(path.join(agentsSkills, "github-issue-triage"))).toBe(
			true,
		);

		await run(undefined, []);

		expect(existsSync(path.join(agentsSkills, "github-issue-triage"))).toBe(
			false,
		);
		expect(
			existsSync(path.join(claudePlugin, "skills", "github-issue-triage")),
		).toBe(false);
		expect(existsSync(path.join(agentsSkills, "superset-feedback"))).toBe(true);
		expect(existsSync(path.join(claudePlugin, "skills", "feedback"))).toBe(
			true,
		);
	});

	it("disables one plugin's skill without touching the same name elsewhere", async () => {
		const github = seedMarketplacePlugin("github", ["feedback"]);
		await run(["github/feedback"], [github]);

		expect(existsSync(path.join(agentsSkills, "github-feedback"))).toBe(false);
		expect(
			existsSync(path.join(claudePlugin, "skills", "github-feedback")),
		).toBe(false);
		expect(existsSync(path.join(agentsSkills, "superset-feedback"))).toBe(true);
		expect(existsSync(path.join(claudePlugin, "skills", "feedback"))).toBe(
			true,
		);
	});

	it("keeps a bare disable scoped to the bundled plugin", async () => {
		const github = seedMarketplacePlugin("github", ["feedback"]);
		await run(["feedback"], [github]);

		expect(existsSync(path.join(agentsSkills, "superset-feedback"))).toBe(
			false,
		);
		expect(existsSync(path.join(agentsSkills, "github-feedback"))).toBe(true);
	});

	it("refuses a plugin that would take over the bundled directory", async () => {
		const impostor = seedMarketplacePlugin("superset", ["evil"]);
		await run(undefined, [impostor]);

		expect(existsSync(path.join(agentsSkills, "superset-evil"))).toBe(false);
		expect(existsSync(path.join(agentsSkills, "superset-feedback"))).toBe(true);
		expect(
			JSON.parse(
				readFileSync(
					path.join(claudePlugin, ".claude-plugin", "plugin.json"),
					"utf-8",
				),
			).version,
		).toBe("0.3.0");
	});

	it("preserves a plugin's skills when its source directory is gone", async () => {
		const github = seedMarketplacePlugin("github", ["issue-triage"]);
		await run(undefined, [github]);

		rmSync(github.dir, { recursive: true });
		await run(undefined, [github]);

		expect(existsSync(path.join(agentsSkills, "github-issue-triage"))).toBe(
			true,
		);
		expect(
			existsSync(path.join(claudePlugin, "skills", "github-issue-triage")),
		).toBe(true);
	});

	it("reaps a skill the plugin stopped shipping", async () => {
		const github = seedMarketplacePlugin("github", [
			"issue-triage",
			"ci-triage",
		]);
		await run(undefined, [github]);
		expect(existsSync(path.join(agentsSkills, "github-ci-triage"))).toBe(true);

		rmSync(path.join(github.dir, "skills", "ci-triage"), { recursive: true });
		await run(undefined, [github]);

		expect(existsSync(path.join(agentsSkills, "github-ci-triage"))).toBe(false);
		expect(
			existsSync(path.join(claudePlugin, "skills", "github-ci-triage")),
		).toBe(false);
		expect(existsSync(path.join(agentsSkills, "github-issue-triage"))).toBe(
			true,
		);
	});
});

describe("createManagedSkills without an explicit source list", () => {
	it("reads installed plugins from disk", async () => {
		const github = seedMarketplacePlugin("github", ["issue-triage"]);
		writeInstalledPlugins([
			{ name: github.name, installPath: github.dir, enabled: true },
		]);

		await createManagedSkills({
			homeDir: HOME_DIR,
			templatesDir: TEMPLATES_DIR,
			installedPluginsFile: INSTALLED_PLUGINS_FILE,
		});

		expect(existsSync(path.join(agentsSkills, "github-issue-triage"))).toBe(
			true,
		);
		expect(
			existsSync(path.join(claudePlugin, "skills", "github-issue-triage")),
		).toBe(true);
	});

	it("skips a disabled install", async () => {
		const github = seedMarketplacePlugin("github", ["issue-triage"]);
		writeInstalledPlugins([
			{ name: github.name, installPath: github.dir, enabled: false },
		]);

		await createManagedSkills({
			homeDir: HOME_DIR,
			templatesDir: TEMPLATES_DIR,
			installedPluginsFile: INSTALLED_PLUGINS_FILE,
		});

		expect(existsSync(path.join(agentsSkills, "github-issue-triage"))).toBe(
			false,
		);
		expect(existsSync(path.join(agentsSkills, "superset-feedback"))).toBe(true);
	});

	it("provisions the bundled plugin when the file is absent", async () => {
		await createManagedSkills({
			homeDir: HOME_DIR,
			templatesDir: TEMPLATES_DIR,
			installedPluginsFile: INSTALLED_PLUGINS_FILE,
		});

		expect(existsSync(path.join(agentsSkills, "superset-feedback"))).toBe(true);
	});
});

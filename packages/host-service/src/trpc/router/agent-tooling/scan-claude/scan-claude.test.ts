import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SlashCommand } from "@superset/shared/slash-commands";
import { CLAUDE_BUILTIN_SLASH_COMMANDS } from "../builtins";
import { scanClaudeSlashCommands } from "./scan-claude";

/** Every scan ends with the static builtins; these tests assert the scanned part. */
function customs(commands: SlashCommand[]): SlashCommand[] {
	return commands.filter((command) => command.kind === "custom");
}

let root: string;
let worktree: string;
let configDir: string;

function write(path: string, content: string): void {
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, content);
}

function command(body: string): string {
	return `---\ndescription: ${body}\nargument-hint: <scope>\n---\nDo the thing.`;
}

function skill(description: string): string {
	return `---\nname: whatever\ndescription: ${description}\n---\nSkill body.`;
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "scan-claude-test-"));
	worktree = join(root, "worktree");
	configDir = join(root, "claude-home");
	mkdirSync(worktree, { recursive: true });
	mkdirSync(configDir, { recursive: true });
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("scanClaudeSlashCommands", () => {
	it("returns only the builtins on a bare workspace and config dir", async () => {
		const result = await scanClaudeSlashCommands({
			worktreePath: worktree,
			configDir,
		});
		expect(result).toEqual([...CLAUDE_BUILTIN_SLASH_COMMANDS]);
	});

	it("appends builtins after scanned commands, shadowed by same-named customs", async () => {
		mkdirSync(join(worktree, ".claude", "commands"), { recursive: true });
		write(
			join(worktree, ".claude", "commands", "review.md"),
			command("Custom review"),
		);

		const result = await scanClaudeSlashCommands({
			worktreePath: worktree,
			configDir,
		});
		const reviews = result.filter((entry) => entry.name === "review");
		expect(reviews).toHaveLength(1);
		expect(reviews[0]).toMatchObject({
			kind: "custom",
			description: "Custom review",
		});
		expect(result[result.length - 1]?.kind).toBe("builtin");
	});

	it("scans project commands, namespacing subdirectories as dir:name", async () => {
		mkdirSync(join(worktree, ".claude", "commands", "pr"), { recursive: true });
		write(
			join(worktree, ".claude", "commands", "ci-check.md"),
			command("Run CI"),
		);
		write(
			join(worktree, ".claude", "commands", "pr", "create-pr.md"),
			command("Create PR"),
		);

		const result = customs(
			await scanClaudeSlashCommands({ worktreePath: worktree, configDir }),
		);
		expect(result.map((entry) => entry.name).sort()).toEqual([
			"ci-check",
			"pr:create-pr",
		]);
		const ciCheck = result.find((entry) => entry.name === "ci-check");
		expect(ciCheck).toMatchObject({
			description: "Run CI",
			argumentHint: "<scope>",
			kind: "custom",
			source: "project",
			entryKind: "command",
			trigger: "/",
		});
	});

	it("project commands shadow global commands of the same name", async () => {
		mkdirSync(join(worktree, ".claude", "commands"), { recursive: true });
		mkdirSync(join(configDir, "commands"), { recursive: true });
		write(
			join(worktree, ".claude", "commands", "deslop.md"),
			command("project version"),
		);
		write(join(configDir, "commands", "deslop.md"), command("global version"));

		const result = customs(
			await scanClaudeSlashCommands({ worktreePath: worktree, configDir }),
		);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			description: "project version",
			source: "project",
		});
	});

	it("follows a commands dir that is a symlink into .agents", async () => {
		mkdirSync(join(worktree, ".agents", "commands"), { recursive: true });
		mkdirSync(join(worktree, ".claude"), { recursive: true });
		write(
			join(worktree, ".agents", "commands", "draft.md"),
			command("Draft a ticket"),
		);
		symlinkSync(
			join("..", ".agents", "commands"),
			join(worktree, ".claude", "commands"),
			"dir",
		);

		const result = customs(
			await scanClaudeSlashCommands({ worktreePath: worktree, configDir }),
		);
		expect(result.map((entry) => entry.name)).toEqual(["draft"]);
	});

	it("scans skills from project and config dirs", async () => {
		mkdirSync(join(worktree, ".claude", "skills", "db-migrations"), {
			recursive: true,
		});
		write(
			join(worktree, ".claude", "skills", "db-migrations", "SKILL.md"),
			skill("Create a database migration"),
		);
		mkdirSync(join(configDir, "skills", "redesign"), { recursive: true });
		write(
			join(configDir, "skills", "redesign", "SKILL.md"),
			skill("Redesign a component"),
		);

		const result = customs(
			await scanClaudeSlashCommands({ worktreePath: worktree, configDir }),
		);
		expect(result.map((entry) => entry.name).sort()).toEqual([
			"db-migrations",
			"redesign",
		]);
		expect(result[0]).toMatchObject({
			entryKind: "skill",
			argumentHint: "",
			trigger: "/",
		});
	});

	it("surfaces a skills-directory plugin's commands and skills as name:entry", async () => {
		// The managed-plugin layout: a plugin manifest inside skills/, with its
		// own commands/ and skills/ trees (see managed-skills.ts).
		const pluginDir = join(configDir, "skills", "superset");
		mkdirSync(join(pluginDir, "skills", "cdp-verification"), {
			recursive: true,
		});
		mkdirSync(join(pluginDir, "skills", "decide"), { recursive: true });
		mkdirSync(join(pluginDir, "commands"), { recursive: true });
		write(join(pluginDir, "plugin.json"), JSON.stringify({ name: "superset" }));
		write(
			join(pluginDir, "skills", "cdp-verification", "SKILL.md"),
			skill("Verify over CDP"),
		);
		write(
			join(pluginDir, "skills", "decide", "SKILL.md"),
			skill("Walk through decisions"),
		);
		write(join(pluginDir, "commands", "feedback.md"), command("Send feedback"));

		const result = customs(
			await scanClaudeSlashCommands({ worktreePath: worktree, configDir }),
		);
		expect(result.map((entry) => entry.name).sort()).toEqual([
			"superset:cdp-verification",
			"superset:decide",
			"superset:feedback",
		]);
		expect(result.every((entry) => entry.source === "plugin")).toBe(true);
	});

	it("ignores a nested dir in skills/ that has no plugin manifest", async () => {
		const nested = join(worktree, ".claude", "skills", "group", "inner");
		mkdirSync(nested, { recursive: true });
		write(join(nested, "SKILL.md"), skill("Should not appear"));

		expect(
			customs(
				await scanClaudeSlashCommands({ worktreePath: worktree, configDir }),
			),
		).toEqual([]);
	});

	it("scans installed plugins' commands and skills, namespaced by plugin", async () => {
		const installPath = join(root, "plugin-cache", "agent-sdk-dev");
		mkdirSync(join(installPath, "commands"), { recursive: true });
		mkdirSync(join(installPath, "skills", "verifier"), { recursive: true });
		write(
			join(installPath, "commands", "new-sdk-app.md"),
			command("Scaffold an SDK app"),
		);
		write(
			join(installPath, "skills", "verifier", "SKILL.md"),
			skill("Verify SDK apps"),
		);
		write(
			join(configDir, "plugins", "installed_plugins.json"),
			JSON.stringify({
				version: 2,
				plugins: {
					"agent-sdk-dev@claude-plugins-official": [
						{ scope: "user", installPath },
					],
				},
			}),
		);

		const result = customs(
			await scanClaudeSlashCommands({ worktreePath: worktree, configDir }),
		);
		expect(result.map((entry) => entry.name).sort()).toEqual([
			"agent-sdk-dev:new-sdk-app",
			"agent-sdk-dev:verifier",
		]);
		expect(result.every((entry) => entry.source === "plugin")).toBe(true);
	});

	it("ignores malformed plugin state and installs whose path is gone", async () => {
		write(join(configDir, "plugins", "installed_plugins.json"), "{not json");
		expect(
			customs(
				await scanClaudeSlashCommands({ worktreePath: worktree, configDir }),
			),
		).toEqual([]);

		write(
			join(configDir, "plugins", "installed_plugins.json"),
			JSON.stringify({
				version: 2,
				plugins: {
					"gone@market": [{ installPath: join(root, "does-not-exist") }],
				},
			}),
		);
		expect(
			customs(
				await scanClaudeSlashCommands({ worktreePath: worktree, configDir }),
			),
		).toEqual([]);
	});
});

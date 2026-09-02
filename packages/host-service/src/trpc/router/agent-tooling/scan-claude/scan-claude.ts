import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { SlashCommand } from "@superset/shared/slash-commands";
import { CLAUDE_BUILTIN_SLASH_COMMANDS } from "../builtins";
import type { SlashCommandScanContext } from "../registry";
import {
	dedupeFirstWins,
	listSkillsDirPlugins,
	scanCommandDir,
	scanSkillsDir,
} from "../scan-fs";

export interface InstalledClaudePlugin {
	name: string;
	installPath: string;
}

/**
 * Plugins the Claude CLI has installed, from
 * `<configDir>/plugins/installed_plugins.json` (v2 format:
 * `{ plugins: { "name@marketplace": [{ installPath, ... }] } }`). Their
 * commands and skills surface namespaced as `<plugin>:<name>`. Malformed or
 * missing state reads as no plugins; installs whose path is gone are skipped.
 */
export async function readInstalledClaudePlugins(
	configDir: string,
): Promise<InstalledClaudePlugin[]> {
	let raw: string;
	try {
		raw = await readFile(
			join(configDir, "plugins", "installed_plugins.json"),
			"utf-8",
		);
	} catch {
		return [];
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	const plugins =
		parsed && typeof parsed === "object"
			? (parsed as { plugins?: unknown }).plugins
			: undefined;
	if (!plugins || typeof plugins !== "object") return [];

	const installed: InstalledClaudePlugin[] = [];
	for (const [key, installs] of Object.entries(plugins)) {
		if (!Array.isArray(installs)) continue;
		const name = key.split("@")[0];
		if (!name) continue;
		const installPath = installs.find(
			(install): install is { installPath: string } =>
				install &&
				typeof install === "object" &&
				typeof (install as { installPath?: unknown }).installPath === "string",
		)?.installPath;
		if (!installPath) continue;
		try {
			if (!(await stat(installPath)).isDirectory()) continue;
		} catch {
			continue;
		}
		installed.push({ name, installPath });
	}
	return installed;
}

/**
 * Everything Claude Code offers behind `/` in this workspace: project and
 * user commands, project and user skills, and plugin commands and skills —
 * both installed plugins and skills-directory plugins (a plugin manifest
 * living inside `skills/`, like the managed `superset` one, which Claude
 * loads as a plugin named after its directory).
 */
export async function scanClaudeSlashCommands(
	ctx: SlashCommandScanContext,
): Promise<SlashCommand[]> {
	const [installedPlugins, skillsDirPlugins] = await Promise.all([
		readInstalledClaudePlugins(ctx.configDir),
		listSkillsDirPlugins(join(ctx.configDir, "skills")),
	]);
	const plugins = [...installedPlugins, ...skillsDirPlugins];

	const commandScans = [
		scanCommandDir(join(ctx.worktreePath, ".claude", "commands"), {
			source: "project",
			trigger: "/",
			recursive: true,
		}),
		scanCommandDir(join(ctx.configDir, "commands"), {
			source: "global",
			trigger: "/",
			recursive: true,
		}),
		...plugins.map((plugin) =>
			scanCommandDir(join(plugin.installPath, "commands"), {
				source: "plugin",
				trigger: "/",
				recursive: true,
				namePrefix: `${plugin.name}:`,
			}),
		),
	];
	const skillScans = [
		scanSkillsDir(join(ctx.worktreePath, ".claude", "skills"), {
			source: "project",
			trigger: "/",
		}),
		scanSkillsDir(join(ctx.configDir, "skills"), {
			source: "global",
			trigger: "/",
		}),
		...plugins.map((plugin) =>
			scanSkillsDir(join(plugin.installPath, "skills"), {
				source: "plugin",
				trigger: "/",
				namePrefix: `${plugin.name}:`,
			}),
		),
	];

	const [commands, skills] = await Promise.all([
		Promise.all(commandScans).then((lists) => dedupeFirstWins(lists.flat())),
		Promise.all(skillScans).then((lists) => dedupeFirstWins(lists.flat())),
	]);
	// Builtins last, and shadowed by a same-named custom command — composers
	// sort builtins to the bottom, so the order here matches what renders.
	return dedupeFirstWins([
		...commands,
		...skills,
		...CLAUDE_BUILTIN_SLASH_COMMANDS,
	]);
}

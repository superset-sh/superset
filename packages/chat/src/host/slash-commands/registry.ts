import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { getBuiltInSlashCommands } from "./builtins";
import { parseSlashCommandFrontmatter } from "./frontmatter";
import type { SlashCommandRegistryEntry, SlashCommandSource } from "./types";

interface SlashCommandRegistryOptions {
	homeDirectory?: string;
	projectDirectory?: string;
	includeBuiltIns?: boolean;
}

function getCommandDirectoryEntries(
	cwd: string,
	options?: SlashCommandRegistryOptions,
): Array<{
	directory: string;
	source: SlashCommandSource;
}> {
	const projectDirectory = options?.projectDirectory ?? cwd;
	const homeDirectory = options?.homeDirectory ?? homedir();

	return [
		{
			directory: join(projectDirectory, ".claude", "commands"),
			source: "project",
		},
		{
			directory: join(projectDirectory, ".claude", "command"),
			source: "project",
		},
		{
			directory: join(homeDirectory, ".claude", "commands"),
			source: "global",
		},
		{
			directory: join(homeDirectory, ".claude", "command"),
			source: "global",
		},
	];
}

function listMarkdownFiles(directory: string): string[] {
	const markdownFiles: string[] = [];

	function visit(relativeDirectory: string): void {
		const absoluteDirectory = relativeDirectory
			? join(directory, relativeDirectory)
			: directory;

		const entries = readdirSync(absoluteDirectory, {
			withFileTypes: true,
		}).sort((a, b) => a.name.localeCompare(b.name));

		for (const entry of entries) {
			const relativePath = relativeDirectory
				? join(relativeDirectory, entry.name)
				: entry.name;

			if (entry.isDirectory()) {
				visit(relativePath);
				continue;
			}

			if (entry.isFile() && entry.name.endsWith(".md")) {
				markdownFiles.push(relativePath);
			}
		}
	}

	visit("");
	return markdownFiles;
}

function toCommandName(relativeFilePath: string): string {
	return relativeFilePath.replace(/\.md$/, "").split(sep).join("/");
}

function normalizeAliases(name: string, aliases: string[]): string[] {
	const normalizedName = name.toLowerCase();
	const seen = new Set<string>();
	const result: string[] = [];

	for (const alias of aliases) {
		const normalizedAlias = alias.trim().replace(/^\//, "");
		if (!normalizedAlias) continue;

		const key = normalizedAlias.toLowerCase();
		if (key === normalizedName) continue;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(normalizedAlias);
	}

	return result;
}

export function buildSlashCommandRegistry(
	cwd: string,
	options?: SlashCommandRegistryOptions,
): SlashCommandRegistryEntry[] {
	const commands: SlashCommandRegistryEntry[] = [];
	const seenNames = new Set<string>();

	for (const { directory, source } of getCommandDirectoryEntries(
		cwd,
		options,
	)) {
		if (!existsSync(directory)) continue;

		try {
			for (const fileName of listMarkdownFiles(directory)) {
				const name = toCommandName(fileName);
				if (seenNames.has(name)) continue;

				seenNames.add(name);
				const filePath = join(directory, fileName);
				const raw = readFileSync(filePath, "utf-8");
				const metadata = parseSlashCommandFrontmatter(raw);

				commands.push({
					name,
					aliases: normalizeAliases(name, metadata.aliases),
					description: metadata.description,
					argumentHint: metadata.argumentHint,
					kind: "custom",
					filePath,
					source,
				});
			}
		} catch (error) {
			console.warn(
				`[slash-commands] Failed to read commands from ${directory}:`,
				error,
			);
		}
	}

	const includeBuiltIns = options?.includeBuiltIns ?? true;
	if (includeBuiltIns) {
		for (const command of getBuiltInSlashCommands()) {
			if (seenNames.has(command.name)) continue;
			seenNames.add(command.name);
			commands.push({
				...command,
				aliases: normalizeAliases(command.name, command.aliases),
			});
		}
	}

	return commands;
}

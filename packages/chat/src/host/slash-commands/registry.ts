import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { parseSlashCommandFrontmatter } from "./frontmatter";
import type { SlashCommandRegistryEntry, SlashCommandSource } from "./types";

interface SlashCommandRegistryOptions {
	homeDirectory?: string;
	projectDirectory?: string;
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

	return commands;
}

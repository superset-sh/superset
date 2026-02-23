import { readFileSync } from "node:fs";
import { buildSlashCommandRegistry } from "./registry";

interface SlashCommandInvocation {
	name: string;
	argumentsRaw: string;
}

export interface ResolvedSlashCommand {
	handled: boolean;
	commandName?: string;
	prompt?: string;
}

function parseSlashCommandInvocation(
	text: string,
): SlashCommandInvocation | null {
	const match = text.trim().match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
	if (!match) return null;

	return {
		name: match[1] ?? "",
		argumentsRaw: (match[2] ?? "").trim(),
	};
}

function parseSlashCommandArguments(argumentsRaw: string): string[] {
	if (!argumentsRaw) return [];

	const tokens: string[] = [];
	const tokenPattern = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+)/g;

	for (const match of argumentsRaw.matchAll(tokenPattern)) {
		if (match[1] !== undefined) {
			tokens.push(match[1].replace(/\\(["\\])/g, "$1"));
			continue;
		}

		if (match[2] !== undefined) {
			tokens.push(match[2].replace(/\\(['\\])/g, "$1"));
			continue;
		}

		if (match[3] !== undefined) {
			tokens.push(match[3]);
		}
	}

	return tokens;
}

function stripFrontmatter(raw: string): string {
	if (!raw.startsWith("---")) return raw;

	const lines = raw.split(/\r?\n/);
	if (lines[0]?.trim() !== "---") return raw;

	let endIndex = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i]?.trim() === "---") {
			endIndex = i;
			break;
		}
	}

	if (endIndex === -1) return raw;

	return lines
		.slice(endIndex + 1)
		.join("\n")
		.trimStart();
}

function renderSlashCommandPrompt(
	template: string,
	argumentsRaw: string,
	argumentTokens: string[],
): string {
	const withAllArguments = template.replaceAll("$ARGUMENTS", argumentsRaw);
	return withAllArguments.replace(/\$(\d+)/g, (_, index: string) => {
		const argumentIndex = Number.parseInt(index, 10) - 1;
		return argumentTokens[argumentIndex] ?? "";
	});
}

export function resolveSlashCommand(
	cwd: string,
	text: string,
): ResolvedSlashCommand {
	const invocation = parseSlashCommandInvocation(text);
	if (!invocation) return { handled: false };

	const command = buildSlashCommandRegistry(cwd).find(
		(entry) => entry.name.toLowerCase() === invocation.name.toLowerCase(),
	);
	if (!command) return { handled: false };

	const rawCommand = readFileSync(command.filePath, "utf-8");
	const template = stripFrontmatter(rawCommand);
	const argumentTokens = parseSlashCommandArguments(invocation.argumentsRaw);
	const prompt = renderSlashCommandPrompt(
		template,
		invocation.argumentsRaw,
		argumentTokens,
	).trim();

	return {
		handled: true,
		commandName: command.name,
		prompt,
	};
}

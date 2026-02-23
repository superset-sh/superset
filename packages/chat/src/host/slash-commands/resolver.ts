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

function parseNamedSlashCommandArguments(
	argumentTokens: string[],
): Map<string, string> {
	const namedArguments = new Map<string, string>();

	for (const token of argumentTokens) {
		const match = token.match(/^(?:--?)?([A-Za-z_][\w-]*)=(.*)$/);
		if (!match) continue;
		const rawKey = match[1];
		const rawValue = match[2];
		if (rawKey === undefined || rawValue === undefined) continue;

		const key = rawKey.replace(/-/g, "_").toUpperCase();
		namedArguments.set(key, rawValue);
	}

	return namedArguments;
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
	commandName: string,
	cwd: string,
	argumentsRaw: string,
	argumentTokens: string[],
): string {
	const namedArguments = parseNamedSlashCommandArguments(argumentTokens);
	namedArguments.set("COMMAND", commandName);
	namedArguments.set("CWD", cwd);

	const withAllArguments = template.replaceAll("$ARGUMENTS", argumentsRaw);
	const withPositionalArguments = withAllArguments.replace(
		/\$\{(\d+)\}|\$(\d+)/g,
		(_, bracedIndex: string | undefined, plainIndex: string | undefined) => {
			const index = bracedIndex ?? plainIndex;
			if (!index) return "";
			const argumentIndex = Number.parseInt(index, 10) - 1;
			return argumentTokens[argumentIndex] ?? "";
		},
	);

	return withPositionalArguments.replace(
		/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
		(match, bracedName: string | undefined, plainName: string | undefined) => {
			const name = (bracedName ?? plainName)?.toUpperCase();
			if (!name) return match;
			return namedArguments.get(name) ?? match;
		},
	);
}

function resolveCommandTemplate(command: {
	kind: "custom" | "builtin";
	filePath?: string;
	template?: string;
}): string {
	if (command.kind === "builtin") return command.template ?? "";
	if (!command.filePath) return "";

	const rawCommand = readFileSync(command.filePath, "utf-8");
	return stripFrontmatter(rawCommand);
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

	const template = resolveCommandTemplate(command);
	const argumentTokens = parseSlashCommandArguments(invocation.argumentsRaw);
	const prompt = renderSlashCommandPrompt(
		template,
		command.name,
		cwd,
		invocation.argumentsRaw,
		argumentTokens,
	).trim();

	return {
		handled: true,
		commandName: command.name,
		prompt,
	};
}

import { readFileSync } from "node:fs";
import {
	findSlashCommandByNameOrAlias,
	parseNamedSlashArgumentToken,
	tokenizeSlashCommandArguments,
} from "../../shared";
import { buildSlashCommandRegistry } from "./registry";
import type { SlashCommandActionType } from "./types";

interface SlashCommandInvocation {
	name: string;
	argumentsRaw: string;
}

export interface ResolvedSlashCommand {
	handled: boolean;
	commandName?: string;
	invokedAs?: string;
	prompt?: string;
	action?: {
		type: SlashCommandActionType;
		argument?: string;
	};
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

function parseNamedSlashCommandArguments(
	argumentTokens: string[],
): Map<string, string> {
	const namedArguments = new Map<string, string>();

	for (const token of argumentTokens) {
		const parsed = parseNamedSlashArgumentToken(token);
		if (!parsed) continue;
		namedArguments.set(parsed.keyUpper, parsed.value);
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
	const withPositionalArguments = template.replace(
		/\$\{(\d+)\}|\$(\d+)/g,
		(_, bracedIndex: string | undefined, plainIndex: string | undefined) => {
			const index = bracedIndex ?? plainIndex;
			if (!index) return "";
			const argumentIndex = Number.parseInt(index, 10) - 1;
			return argumentTokens[argumentIndex] ?? "";
		},
	);
	const withNamedArguments = withPositionalArguments.replace(
		/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
		(match, bracedName: string | undefined, plainName: string | undefined) => {
			const name = (bracedName ?? plainName)?.toUpperCase();
			if (!name) return match;
			if (name === "ARGUMENTS") return match;
			return namedArguments.get(name) ?? match;
		},
	);

	return withNamedArguments.replaceAll("$ARGUMENTS", argumentsRaw);
}

function resolveCommandTemplate(command: {
	kind: "custom" | "builtin";
	name: string;
	filePath?: string;
	template?: string;
}): string {
	if (command.kind === "builtin") return command.template ?? "";
	if (!command.filePath) return "";

	try {
		const rawCommand = readFileSync(command.filePath, "utf-8");
		return stripFrontmatter(rawCommand);
	} catch (error) {
		console.warn(
			`[slash-commands] Failed to load template for "${command.name}" from ${command.filePath}:`,
			error,
		);
		return "";
	}
}

export function resolveSlashCommand(
	cwd: string,
	text: string,
): ResolvedSlashCommand {
	const invocation = parseSlashCommandInvocation(text);
	if (!invocation) return { handled: false };

	const registry = buildSlashCommandRegistry(cwd);
	const command = findSlashCommandByNameOrAlias(registry, invocation.name);
	if (!command) return { handled: false };

	const template = resolveCommandTemplate(command);
	const argumentTokens = tokenizeSlashCommandArguments(invocation.argumentsRaw);
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
		invokedAs: invocation.name,
		prompt,
		action: command.action
			? {
					type: command.action.type,
					argument: command.action.passArguments
						? invocation.argumentsRaw
						: undefined,
				}
			: undefined,
	};
}

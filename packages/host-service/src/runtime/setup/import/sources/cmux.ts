import {
	asRecord,
	IMPORT_MAX_KEYWORDS,
	IMPORT_MAX_LIST_ENTRIES,
	isFieldWithinLimit,
	parseJsonObject,
	pushNotImported,
	readScriptField,
} from "../limits";
import type {
	NotImportedField,
	ParsedSetupSource,
	RepoFileReader,
} from "../types";
import { normalizeRelativePath } from "./orca";

const CMUX_FILES = [".cmux/cmux.json", "cmux.json"] as const;
const SETUP_NAMES = new Set([
	"setup",
	"project setup",
	"workspace setup",
	"repository setup",
]);
const SETUP_KEYWORDS = new Set(["setup", "init", "initialize", "install"]);
const IMPORTED_COMMAND_FIELDS = new Set([
	"name",
	"title",
	"description",
	"keywords",
	"command",
	"cwd",
]);

function matchText(value: unknown): string {
	return typeof value === "string" && isFieldWithinLimit(value)
		? value.trim().toLowerCase().replace(/\s+/g, " ")
		: "";
}

/**
 * cmux has no setup hook, so pick the command a user would run as one: named
 * like setup, or tagged with a setup keyword and mentioning setup.
 */
export function isSetupLikeCommand(command: Record<string, unknown>): boolean {
	const text = matchText(command.command);
	if (!text) return false;
	const labels = [matchText(command.name), matchText(command.title)].filter(
		Boolean,
	);
	if (labels.some((label) => SETUP_NAMES.has(label))) return true;

	const keywords = Array.isArray(command.keywords)
		? command.keywords.slice(0, IMPORT_MAX_KEYWORDS).map(matchText)
		: [];
	if (!keywords.some((keyword) => SETUP_KEYWORDS.has(keyword))) return false;
	return (
		labels.some((label) => label.includes("setup")) || /\bsetup\b/.test(text)
	);
}

function commandLabel(command: Record<string, unknown>, index: number): string {
	return typeof command.name === "string" && command.name.trim()
		? `commands["${command.name.trim()}"]`
		: `commands[${index}]`;
}

function parseCmuxFile(
	file: string,
	config: Record<string, unknown>,
): ParsedSetupSource | null {
	const commands = Array.isArray(config.commands) ? config.commands : [];
	if (commands.length > IMPORT_MAX_LIST_ENTRIES) return null;
	const records = commands.map(asRecord);
	const setupIndex = records.findIndex(
		(command) => command !== null && isSetupLikeCommand(command),
	);
	const setupCommand = records[setupIndex];
	if (!setupCommand) return null;

	const notImported: NotImportedField[] = [];
	const note = (field: string, reason: NotImportedField["reason"]) =>
		pushNotImported(notImported, { file, field, reason });

	const label = commandLabel(setupCommand, setupIndex);
	const setup = readScriptField(
		setupCommand.command,
		{ file, field: `${label}.command` },
		notImported,
	);
	for (const field of Object.keys(setupCommand)) {
		if (!IMPORTED_COMMAND_FIELDS.has(field)) {
			note(`${label}.${field}`, "no-equivalent");
		}
	}

	let cwd: string | undefined;
	if (typeof setupCommand.cwd === "string" && setupCommand.cwd.trim() !== ".") {
		const path = normalizeRelativePath(setupCommand.cwd);
		if (path) cwd = path;
		else note(`${label}.cwd`, "invalid-path");
	}

	records.forEach((command, index) => {
		if (command && index !== setupIndex) {
			note(commandLabel(command, index), "extra-command");
		}
	});
	for (const field of Object.keys(config)) {
		if (field !== "commands" && field !== "$schema") {
			note(field, "no-equivalent");
		}
	}

	return {
		source: "cmux",
		label: "cmux",
		files: [file],
		scripts: { setup: [setup] },
		...(cwd && { cwd }),
		notImported,
	};
}

export function parseCmux(read: RepoFileReader): ParsedSetupSource | null {
	for (const file of CMUX_FILES) {
		const config = parseJsonObject(read(file));
		const parsed = config ? parseCmuxFile(file, config) : null;
		if (parsed) return parsed;
	}
	return null;
}

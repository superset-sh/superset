import {
	asRecord,
	IMPORT_MAX_LIST_ENTRIES,
	parseJsonObject,
	pushNotImported,
	readScriptField,
} from "../limits";
import type {
	NotImportedField,
	ParsedSetupSource,
	RepoFileReader,
} from "../types";

const T3_FILE = "t3.json";
const IMPORTED_SCRIPT_FIELDS = new Set([
	"name",
	"command",
	"icon",
	"runOnWorktreeCreate",
]);

export function parseT3(read: RepoFileReader): ParsedSetupSource | null {
	const config = parseJsonObject(read(T3_FILE));
	if (!config) return null;

	const notImported: NotImportedField[] = [];
	const note = (field: string, reason: NotImportedField["reason"]) =>
		pushNotImported(notImported, { file: T3_FILE, field, reason });

	for (const field of Object.keys(config)) {
		if (field !== "scripts" && field !== "$schema") {
			note(field, "no-equivalent");
		}
	}

	const entries = Array.isArray(config.scripts) ? config.scripts : [];
	if (entries.length > IMPORT_MAX_LIST_ENTRIES) {
		note("scripts", "too-large");
		return null;
	}

	const setup: string[] = [];
	let run = "";
	entries.forEach((value, index) => {
		const entry = asRecord(value);
		if (!entry) return;
		const label =
			typeof entry.name === "string" && entry.name.trim()
				? `scripts["${entry.name.trim()}"]`
				: `scripts[${index}]`;
		const command = readScriptField(
			entry.command,
			{ file: T3_FILE, field: `${label}.command` },
			notImported,
		);
		if (!command) return;

		for (const field of Object.keys(entry)) {
			if (!IMPORTED_SCRIPT_FIELDS.has(field)) {
				note(`${label}.${field}`, "no-equivalent");
			}
		}

		if (entry.runOnWorktreeCreate === true) {
			setup.push(command);
		} else if (!run && (entry.icon ?? "play") === "play") {
			run = command;
		} else {
			note(label, "extra-command");
		}
	});

	return {
		source: "t3",
		label: "T3 Code",
		files: [T3_FILE],
		scripts: { setup, run: [run] },
		notImported,
	};
}

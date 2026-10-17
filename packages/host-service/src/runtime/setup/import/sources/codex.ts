import { pushNotImported } from "../limits";
import type {
	NotImportedField,
	ParsedSetupSource,
	RepoFileReader,
} from "../types";
import { NON_STRING, readTomlEntries, TOO_LARGE, type TomlEntry } from "./toml";

const CODEX_FILE = ".codex/environments/environment.toml";
const IGNORED_ROOT_KEYS = new Set(["version", "name"]);
const IGNORED_ACTION_KEYS = new Set(["name", "icon"]);

function actionLabel(entry: TomlEntry): string {
	return entry.arrayIndex === undefined
		? entry.table
		: `${entry.table}[${entry.arrayIndex}]`;
}

function isAction(entry: TomlEntry): boolean {
	return entry.table === "actions" || entry.table.startsWith("actions.");
}

export function parseCodex(read: RepoFileReader): ParsedSetupSource | null {
	const content = read(CODEX_FILE);
	if (!content) return null;
	const entries = readTomlEntries(content);
	if (!entries) return null;

	const notImported: NotImportedField[] = [];
	const note = (field: string, reason: NotImportedField["reason"]) =>
		pushNotImported(notImported, { file: CODEX_FILE, field, reason });

	let setup = "";
	let cleanup = "";
	let run = "";
	for (const entry of entries) {
		const field = entry.table
			? `${actionLabel(entry)}.${entry.key}`
			: entry.key;
		const isScript =
			(entry.table === "setup" || entry.table === "cleanup") &&
			entry.key === "script";
		const isActionCommand = isAction(entry) && entry.key === "command";

		if (!isScript && !isActionCommand) {
			const ignored =
				(entry.table === "" && IGNORED_ROOT_KEYS.has(entry.key)) ||
				(isAction(entry) && IGNORED_ACTION_KEYS.has(entry.key));
			if (!ignored) note(field, "no-equivalent");
			continue;
		}
		if (entry.value === NON_STRING) {
			note(field, "invalid-value");
			continue;
		}
		if (entry.value === TOO_LARGE) {
			note(field, "too-large");
			continue;
		}
		const value = entry.value.trim();
		if (!value) continue;

		if (entry.table === "setup") setup = value;
		else if (entry.table === "cleanup") cleanup = value;
		else if (!run) run = value;
		else note(actionLabel(entry), "extra-command");
	}

	return {
		source: "codex",
		label: "Codex",
		files: [CODEX_FILE],
		scripts: { setup: [setup], teardown: [cleanup], run: [run] },
		notImported,
	};
}

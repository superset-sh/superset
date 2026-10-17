import {
	asRecord,
	parseJsonObject,
	pushNotImported,
	readScriptField,
} from "../limits";
import type {
	NotImportedField,
	ParsedSetupSource,
	RepoFileReader,
} from "../types";

const CONDUCTOR_FILE = "conductor.json";
const SCRIPT_FIELDS = new Set(["setup", "run", "archive", "teardown"]);

export function parseConductor(read: RepoFileReader): ParsedSetupSource | null {
	const config = parseJsonObject(read(CONDUCTOR_FILE));
	if (!config) return null;

	const notImported: NotImportedField[] = [];
	const scripts = asRecord(config.scripts) ?? {};
	const script = (field: string) =>
		readScriptField(
			scripts[field],
			{ file: CONDUCTOR_FILE, field: `scripts.${field}` },
			notImported,
		);

	for (const field of Object.keys(config)) {
		if (field === "scripts" || field === "$schema") continue;
		pushNotImported(notImported, {
			file: CONDUCTOR_FILE,
			field,
			reason: "no-equivalent",
		});
	}
	for (const field of Object.keys(scripts)) {
		if (SCRIPT_FIELDS.has(field)) continue;
		pushNotImported(notImported, {
			file: CONDUCTOR_FILE,
			field: `scripts.${field}`,
			reason: "no-equivalent",
		});
	}

	return {
		source: "conductor",
		label: "Conductor",
		files: [CONDUCTOR_FILE],
		scripts: {
			setup: [script("setup")],
			teardown: [script("archive"), script("teardown")],
			run: [script("run")],
		},
		notImported,
	};
}

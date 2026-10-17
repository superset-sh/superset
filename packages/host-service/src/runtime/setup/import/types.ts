export const SETUP_IMPORT_SOURCES = [
	"conductor",
	"orca",
	"codex",
	"cmux",
	"t3",
] as const;
export type SetupImportSource = (typeof SETUP_IMPORT_SOURCES)[number];

export const IMPORTED_SCRIPT_KEYS = ["setup", "teardown", "run"] as const;
export type ImportedScriptKey = (typeof IMPORTED_SCRIPT_KEYS)[number];

export type NotImportedReason =
	/** Superset has no setting for it. */
	| "no-equivalent"
	/** A second command where Superset keeps one (run), or a non-setup command. */
	| "extra-command"
	/** A tool-specific variable Superset does not set. */
	| "unsupported-variable"
	/** A path that is unsafe or not a literal relative path. */
	| "invalid-path"
	/** Over the size or count limit. */
	| "too-large"
	/** Present but not the type the tool expects. */
	| "invalid-value";

export interface NotImportedField {
	file: string;
	field: string;
	reason: NotImportedReason;
}

export type RepoFileReader = (relativePath: string) => string | null;

/** What a source parser extracts, before variables are rewritten. */
export interface ParsedSetupSource {
	source: SetupImportSource;
	label: string;
	files: string[];
	/** Script chunks per key, in run order. A chunk can span many lines. */
	scripts: Partial<Record<ImportedScriptKey, string[]>>;
	cwd?: string;
	notImported: NotImportedField[];
}

export interface ImportedScriptPlan {
	/** The entries written to `.superset/config.json`. */
	commands: string[];
	/** Set when the script cannot run as separate `&&`-joined lines. */
	scriptFile?: { path: string; content: string };
}

export interface SetupImportCandidate {
	source: SetupImportSource;
	label: string;
	files: string[];
	scripts: Partial<Record<ImportedScriptKey, ImportedScriptPlan>>;
	cwd?: string;
	notImported: NotImportedField[];
}

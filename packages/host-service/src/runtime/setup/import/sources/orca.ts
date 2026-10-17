import { parse } from "yaml";
import {
	asRecord,
	IMPORT_MAX_INCLUDE_PATHS,
	IMPORT_MAX_LIST_ENTRIES,
	IMPORT_MAX_SHARED_DIRECTORIES,
	isFieldWithinLimit,
	pushNotImported,
	readScriptField,
} from "../limits";
import type {
	NotImportedField,
	ParsedSetupSource,
	RepoFileReader,
} from "../types";

const ORCA_FILE = "orca.yaml";
const INCLUDE_FILE = ".worktreeinclude";
const IMPORTED_FIELDS = new Set(["scripts", "defaultTabs", "worktree"]);
const SHELL_UNSAFE_CHARACTERS = new Set(['"', "$", "`", "\\", "\x7f"]);

function hasShellUnsafeCharacter(path: string): boolean {
	return [...path].some(
		(char) => SHELL_UNSAFE_CHARACTERS.has(char) || char.charCodeAt(0) < 0x20,
	);
}

function parseOrcaYaml(content: string | null): Record<string, unknown> | null {
	if (!content) return null;
	try {
		return asRecord(parse(content, { maxAliasCount: 100, uniqueKeys: true }));
	} catch {
		return null;
	}
}

/** A literal, repository-relative path that is safe inside double quotes. */
export function normalizeRelativePath(raw: string): string | null {
	const path = raw
		.trim()
		.replaceAll("\\", "/")
		.replace(/^(\.\/)+/, "")
		.replace(/\/+$/, "");
	if (!path || !isFieldWithinLimit(path)) return null;
	if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) return null;
	if (/[*?[\]!]/.test(path) || hasShellUnsafeCharacter(path)) return null;
	const segments = path.split("/");
	if (
		segments.some(
			(segment) =>
				segment === "" ||
				segment === "." ||
				segment === ".." ||
				segment === ".git",
		)
	) {
		return null;
	}
	return path;
}

function parentDirectory(path: string): string | null {
	const slash = path.lastIndexOf("/");
	return slash === -1 ? null : path.slice(0, slash);
}

/** Copy or link one root-checkout path into the workspace, Orca style. */
function placeFromRoot(
	path: string,
	sourceTest: "-d" | "-e",
	command: "ln -s" | "cp -R",
): string {
	const parent = parentDirectory(path);
	// `./` keeps a path starting with `-` from reading as an option, and
	// `-L` catches a dangling symlink, which `-e` reports as absent.
	return [
		`if [ ${sourceTest} "$SUPERSET_ROOT_PATH/${path}" ] && [ ! -e "./${path}" ] && [ ! -L "./${path}" ]; then`,
		...(parent ? [`  mkdir -p "./${parent}"`] : []),
		`  ${command} "$SUPERSET_ROOT_PATH/${path}" "./${path}"`,
		"fi",
	].join("\n");
}

function linkSharedDirectory(path: string): string {
	return placeFromRoot(path, "-d", "ln -s");
}

function copyIncludedPath(path: string): string {
	return placeFromRoot(path, "-e", "cp -R");
}

function readSharedDirectories(
	worktree: Record<string, unknown> | null,
	notImported: NotImportedField[],
): string[] {
	const value = worktree?.sharedDirectories;
	if (!Array.isArray(value)) return [];
	const paths = new Set<string>();
	value.slice(0, IMPORT_MAX_SHARED_DIRECTORIES).forEach((entry, index) => {
		const path =
			typeof entry === "string" ? normalizeRelativePath(entry) : null;
		if (path) {
			paths.add(path);
		} else {
			pushNotImported(notImported, {
				file: ORCA_FILE,
				field: `worktree.sharedDirectories[${index}]`,
				reason: "invalid-path",
			});
		}
	});
	return [...paths];
}

function readIncludePaths(
	content: string | null,
	notImported: NotImportedField[],
): string[] {
	if (!content) return [];
	const paths = new Set<string>();
	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		if (paths.size >= IMPORT_MAX_INCLUDE_PATHS) {
			pushNotImported(notImported, {
				file: INCLUDE_FILE,
				field: line,
				reason: "too-large",
			});
			break;
		}
		const path = normalizeRelativePath(line);
		if (path) {
			paths.add(path);
		} else {
			pushNotImported(notImported, {
				file: INCLUDE_FILE,
				field: line,
				reason: "invalid-path",
			});
		}
	}
	return [...paths];
}

function readTabCommands(
	value: unknown,
	notImported: NotImportedField[],
): { index: number; command: string }[] {
	if (!Array.isArray(value)) return [];
	if (value.length > IMPORT_MAX_LIST_ENTRIES) {
		pushNotImported(notImported, {
			file: ORCA_FILE,
			field: "defaultTabs",
			reason: "too-large",
		});
		return [];
	}
	return value.flatMap((entry, index) => {
		const command = readScriptField(
			asRecord(entry)?.command,
			{ file: ORCA_FILE, field: `defaultTabs[${index}].command` },
			notImported,
		);
		return command ? [{ index, command }] : [];
	});
}

export function parseOrca(read: RepoFileReader): ParsedSetupSource | null {
	const orcaContent = read(ORCA_FILE);
	const config = parseOrcaYaml(orcaContent);
	const includeContent = read(INCLUDE_FILE);
	if (!config && !includeContent) return null;

	const notImported: NotImportedField[] = [];
	if (orcaContent && !config) {
		pushNotImported(notImported, {
			file: ORCA_FILE,
			field: ORCA_FILE,
			reason: "invalid-value",
		});
	}
	const scripts = asRecord(config?.scripts) ?? {};
	const script = (field: string) =>
		readScriptField(
			scripts[field],
			{ file: ORCA_FILE, field: `scripts.${field}` },
			notImported,
		);

	for (const field of Object.keys(config ?? {})) {
		if (!IMPORTED_FIELDS.has(field)) {
			pushNotImported(notImported, {
				file: ORCA_FILE,
				field,
				reason: "no-equivalent",
			});
		}
	}
	for (const field of Object.keys(scripts)) {
		if (field !== "setup" && field !== "archive") {
			pushNotImported(notImported, {
				file: ORCA_FILE,
				field: `scripts.${field}`,
				reason: "no-equivalent",
			});
		}
	}

	const sharedDirectories = readSharedDirectories(
		asRecord(config?.worktree),
		notImported,
	);
	const includePaths = readIncludePaths(includeContent, notImported).filter(
		(path) => !sharedDirectories.includes(path),
	);
	const [runTab, ...extraTabs] = readTabCommands(
		config?.defaultTabs,
		notImported,
	);
	for (const tab of extraTabs) {
		pushNotImported(notImported, {
			file: ORCA_FILE,
			field: `defaultTabs[${tab.index}]`,
			reason: "extra-command",
		});
	}

	const files = [
		...(config ? [ORCA_FILE] : []),
		...(includeContent ? [INCLUDE_FILE] : []),
	];
	return {
		source: "orca",
		label: "Orca",
		files,
		scripts: {
			setup: [
				...sharedDirectories.map(linkSharedDirectory),
				...includePaths.map(copyIncludedPath),
				script("setup"),
			],
			teardown: [script("archive")],
			run: [runTab?.command ?? ""],
		},
		notImported,
	};
}

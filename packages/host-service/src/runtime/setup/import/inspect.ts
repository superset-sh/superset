import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getProjectConfigPath } from "../config";
import { createRepoFileReader, parseJsonObject } from "./limits";
import {
	buildCandidate,
	getImportedScriptCommand,
	getImportedScriptPath,
	IMPORTED_SCRIPT_MARKER,
} from "./plan";
import { pathExistsNoFollow } from "./safe-paths";
import { parseCmux } from "./sources/cmux";
import { parseCodex } from "./sources/codex";
import { parseConductor } from "./sources/conductor";
import { parseOrca } from "./sources/orca";
import { parseT3 } from "./sources/t3";
import {
	IMPORTED_SCRIPT_KEYS,
	type ImportedScriptKey,
	type ParsedSetupSource,
	type RepoFileReader,
	type SetupImportCandidate,
} from "./types";

const SOURCE_PARSERS = [
	parseConductor,
	parseOrca,
	parseCodex,
	parseCmux,
	parseT3,
] as const;

export interface SetupImportConflict {
	field: ImportedScriptKey | "cwd";
	/** What `.superset/config.json` holds today for this field. */
	current: string[];
	/** The `.superset/<key>.sh` the import replaces or shadows, if any. */
	currentScriptFile: string | null;
	/** True when that file came from an earlier import and the import deletes it. */
	removesScriptFile: boolean;
}

/** True when `.superset/config.json` exists but is not a JSON object. */
export function isProjectConfigInvalid(repoPath: string): boolean {
	const content = readText(getProjectConfigPath(repoPath));
	return content !== null && parseJsonObject(content) === null;
}

/** Every importable setup in the repo root, in priority order. */
export function inspectSetupImports(
	repoPath: string,
	parsers: readonly ((
		read: RepoFileReader,
	) => ParsedSetupSource | null)[] = SOURCE_PARSERS,
): SetupImportCandidate[] {
	const read = createRepoFileReader(repoPath);
	return parsers.flatMap((parse) => {
		try {
			const candidate = buildCandidate(parse(read));
			return candidate ? [candidate] : [];
		} catch (error) {
			// One unreadable file must not hide the other tools' setups.
			console.error(
				`[setup-import] ${parse.name} failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return [];
		}
	});
}

function readCurrentCommands(
	config: Record<string, unknown> | null,
	key: ImportedScriptKey,
): string[] {
	const value = config?.[key];
	if (!Array.isArray(value)) return [];
	return value.filter(
		(item): item is string => typeof item === "string" && item.trim() !== "",
	);
}

function readText(path: string): string | null {
	try {
		return readFileSync(path, "utf-8");
	} catch {
		return null;
	}
}

export interface SetupImportComparison {
	/** Fields the import would write a different value to. */
	changes: (ImportedScriptKey | "cwd")[];
	/** The subset of changes that replace something the project has today. */
	conflicts: SetupImportConflict[];
}

function isImportedScript(content: string | null): boolean {
	return content?.split("\n")[1]?.startsWith(IMPORTED_SCRIPT_MARKER) ?? false;
}

function sameCommands(a: string[], b: string[]): boolean {
	return (
		a.length === b.length && a.every((command, index) => command === b[index])
	);
}

export function compareWithCurrentSetup(
	repoPath: string,
	candidate: SetupImportCandidate,
): SetupImportComparison {
	const config = parseJsonObject(readText(getProjectConfigPath(repoPath)));
	const changes: SetupImportComparison["changes"] = [];
	const conflicts: SetupImportConflict[] = [];

	for (const key of IMPORTED_SCRIPT_KEYS) {
		const plan = candidate.scripts[key];
		if (!plan) continue;
		const current = readCurrentCommands(config, key);
		const scriptFile = getImportedScriptPath(key);
		const scriptPath = join(repoPath, scriptFile);
		const scriptExists = pathExistsNoFollow(scriptPath);
		const scriptContent = scriptExists ? readText(scriptPath) : null;

		const commandsChange = !sameCommands(current, plan.commands);
		const scriptChanges = plan.scriptFile
			? scriptContent !== plan.scriptFile.content
			: false;
		if (!commandsChange && !scriptChanges) continue;
		changes.push(key);

		const replacesCommands = current.length > 0 && commandsChange;
		// Configured commands shadow `.superset/<key>.sh`, so writing commands
		// over an empty key still replaces a script that runs today.
		const replacesScript = plan.scriptFile
			? scriptExists && scriptChanges
			: scriptExists && current.length === 0;
		if (replacesCommands || replacesScript) {
			conflicts.push({
				field: key,
				current,
				currentScriptFile: scriptExists ? scriptFile : null,
				removesScriptFile:
					!plan.scriptFile &&
					sameCommands(current, [getImportedScriptCommand(key)]) &&
					isImportedScript(scriptContent),
			});
		}
	}

	const currentCwd = typeof config?.cwd === "string" ? config.cwd.trim() : "";
	if (candidate.cwd && currentCwd !== candidate.cwd) {
		changes.push("cwd");
		// `cwd` applies to every key, so commands this import keeps move too.
		const movesKeptCommands = IMPORTED_SCRIPT_KEYS.some(
			(key) =>
				!candidate.scripts[key] && readCurrentCommands(config, key).length > 0,
		);
		if (currentCwd || movesKeptCommands) {
			conflicts.push({
				field: "cwd",
				current: currentCwd ? [currentCwd] : [],
				currentScriptFile: null,
				removesScriptFile: false,
			});
		}
	}
	return { changes, conflicts };
}

/**
 * Identifies what the user reviewed: the proposed import and the current
 * state of every field and script file it would replace. The mutation
 * refuses when this no longer matches.
 */
export function fingerprintSetupImport(
	repoPath: string,
	candidate: SetupImportCandidate,
): string {
	const config = parseJsonObject(readText(getProjectConfigPath(repoPath)));
	const current = IMPORTED_SCRIPT_KEYS.filter(
		(key) => candidate.scripts[key],
	).map((key) => ({
		key,
		commands: readCurrentCommands(config, key),
		script: readText(join(repoPath, getImportedScriptPath(key))),
	}));
	return createHash("sha256")
		.update(
			JSON.stringify({
				candidate,
				current,
				cwd: typeof config?.cwd === "string" ? config.cwd : null,
			}),
		)
		.digest("hex");
}

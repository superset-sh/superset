import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getProjectConfigPath } from "../config";
import { compareWithCurrentSetup } from "./inspect";
import { asRecord } from "./limits";
import { findUnsafeImportPaths } from "./safe-paths";
import { IMPORTED_SCRIPT_KEYS, type SetupImportCandidate } from "./types";

export class SetupImportConflictError extends Error {
	constructor(fields: string[]) {
		super(`Import would replace the existing ${fields.join(", ")}`);
		this.name = "SetupImportConflictError";
	}
}

export class InvalidProjectConfigError extends Error {
	constructor(configPath: string) {
		super(`${configPath} is not a JSON object; fix it before importing`);
		this.name = "InvalidProjectConfigError";
	}
}

export class UnsafeImportPathError extends Error {
	constructor(readonly paths: string[]) {
		super(
			`Import refuses to write through a symlink or outside the project: ${paths.join(", ")}`,
		);
		this.name = "UnsafeImportPathError";
	}
}

async function readConfigObject(
	configPath: string,
): Promise<Record<string, unknown>> {
	let content: string;
	try {
		content = await readFile(configPath, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		throw error;
	}
	try {
		const parsed = asRecord(JSON.parse(content));
		if (parsed) return parsed;
	} catch {}
	throw new InvalidProjectConfigError(configPath);
}

/** A crash mid-write leaves the old file whole: the rename is atomic. */
async function writeFileAtomic(
	filePath: string,
	content: string,
	mode = 0o644,
): Promise<void> {
	const tempPath = `${filePath}.${randomUUID()}.tmp`;
	try {
		await writeFile(tempPath, content, { encoding: "utf-8", mode });
		await rename(tempPath, filePath);
	} catch (error) {
		await rm(tempPath, { force: true });
		throw error;
	}
}

/**
 * Writes the candidate into `.superset/`. Refuses to replace an existing
 * field unless `overwrite` is set, and never touches keys it does not import.
 * Returns the repo-relative paths it wrote.
 */
export async function applySetupImport(args: {
	repoPath: string;
	candidate: SetupImportCandidate;
	overwrite: boolean;
}): Promise<string[]> {
	const { repoPath, candidate } = args;
	const unsafePaths = findUnsafeImportPaths(repoPath, candidate);
	if (unsafePaths.length > 0) throw new UnsafeImportPathError(unsafePaths);
	const { conflicts } = compareWithCurrentSetup(repoPath, candidate);
	if (conflicts.length > 0 && !args.overwrite) {
		throw new SetupImportConflictError(conflicts.map((c) => c.field));
	}

	const configPath = getProjectConfigPath(repoPath);
	const config = await readConfigObject(configPath);
	await mkdir(dirname(configPath), { recursive: true });

	const written: string[] = [];
	for (const key of IMPORTED_SCRIPT_KEYS) {
		const plan = candidate.scripts[key];
		if (!plan) continue;
		if (plan.scriptFile) {
			await writeFileAtomic(
				join(repoPath, plan.scriptFile.path),
				plan.scriptFile.content,
				0o755,
			);
			written.push(plan.scriptFile.path);
		}
		config[key] = plan.commands;
	}
	if (candidate.cwd) config.cwd = candidate.cwd;

	await writeFileAtomic(configPath, `${JSON.stringify(config, null, 2)}\n`);
	written.push(".superset/config.json");

	for (const conflict of conflicts) {
		if (conflict.removesScriptFile && conflict.currentScriptFile) {
			await rm(join(repoPath, conflict.currentScriptFile), { force: true });
		}
	}
	return written;
}

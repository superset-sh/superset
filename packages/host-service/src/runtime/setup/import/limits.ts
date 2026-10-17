import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { NotImportedField, RepoFileReader } from "./types";

export const IMPORT_FILE_MAX_BYTES = 256 * 1024;
export const IMPORT_FIELD_MAX_BYTES = 64 * 1024;
export const IMPORT_MAX_LIST_ENTRIES = 256;
export const IMPORT_MAX_KEYWORDS = 64;
export const IMPORT_MAX_NOT_IMPORTED = 128;
export const IMPORT_MAX_TOML_LINES = 4096;
export const IMPORT_MAX_INCLUDE_PATHS = 1000;
export const IMPORT_MAX_SHARED_DIRECTORIES = 100;

function isWithinLimit(value: string, maxBytes: number): boolean {
	return value.length <= maxBytes && Buffer.byteLength(value) <= maxBytes;
}

export function isFieldWithinLimit(value: string): boolean {
	return isWithinLimit(value, IMPORT_FIELD_MAX_BYTES);
}

export function createRepoFileReader(repoPath: string): RepoFileReader {
	return (relativePath) => {
		const filePath = join(repoPath, relativePath);
		try {
			const stats = statSync(filePath);
			if (!stats.isFile() || stats.size > IMPORT_FILE_MAX_BYTES) return null;
			const content = readFileSync(filePath, "utf-8");
			return isWithinLimit(content, IMPORT_FILE_MAX_BYTES) ? content : null;
		} catch {
			return null;
		}
	};
}

export function pushNotImported(
	list: NotImportedField[],
	entry: NotImportedField,
): void {
	if (list.length >= IMPORT_MAX_NOT_IMPORTED) return;
	if (
		list.some(
			(existing) =>
				existing.file === entry.file && existing.field === entry.field,
		)
	) {
		return;
	}
	list.push(entry);
}

export function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export function parseJsonObject(
	content: string | null,
): Record<string, unknown> | null {
	if (!content) return null;
	try {
		return asRecord(JSON.parse(content));
	} catch {
		return null;
	}
}

/**
 * Reads one script field. Returns the trimmed script, or "" when the field is
 * absent or empty; a non-string or oversized value is reported and dropped.
 */
export function readScriptField(
	value: unknown,
	location: { file: string; field: string },
	notImported: NotImportedField[],
): string {
	if (value === undefined || value === null) return "";
	if (typeof value !== "string") {
		pushNotImported(notImported, { ...location, reason: "invalid-value" });
		return "";
	}
	if (!isFieldWithinLimit(value)) {
		pushNotImported(notImported, { ...location, reason: "too-large" });
		return "";
	}
	return value.trim();
}

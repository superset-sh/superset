import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_SUPERSET_DIR_NAME, URLS_FILE_NAME } from "shared/constants";
import type { StaticUrlsResult } from "shared/types";

interface UrlEntry {
	url: unknown;
	label: unknown;
}

interface UrlsConfig {
	urls: unknown;
}

/**
 * Validate a single URL entry from the urls.json configuration.
 *
 * @param entry - The URL entry object to validate
 * @param index - The index of the entry in the urls array (for error messages)
 * @returns Validation result with either the validated url/label or an error message
 */
function validateUrlEntry(
	entry: UrlEntry,
	index: number,
):
	| { valid: true; url: string; label: string }
	| { valid: false; error: string } {
	if (typeof entry !== "object" || entry === null) {
		return { valid: false, error: `urls[${index}] must be an object` };
	}

	if (!("url" in entry)) {
		return {
			valid: false,
			error: `urls[${index}] is missing required field 'url'`,
		};
	}

	if (!("label" in entry)) {
		return {
			valid: false,
			error: `urls[${index}] is missing required field 'label'`,
		};
	}

	const { url, label } = entry;

	if (typeof url !== "string") {
		return { valid: false, error: `urls[${index}].url must be a string` };
	}

	if (url.trim() === "") {
		return { valid: false, error: `urls[${index}].url cannot be empty` };
	}

	if (typeof label !== "string") {
		return { valid: false, error: `urls[${index}].label must be a string` };
	}

	if (label.trim() === "") {
		return { valid: false, error: `urls[${index}].label cannot be empty` };
	}

	return { valid: true, url: url.trim(), label: label.trim() };
}

/**
 * Load and validate static URLs configuration from a worktree's .superset/urls.json file.
 *
 * @param worktreePath - Path to the workspace's worktree directory
 * @returns StaticUrlsResult with exists flag, urls array, and any error message
 */
export function loadStaticUrls(worktreePath: string): StaticUrlsResult {
	const urlsPath = join(
		worktreePath,
		PROJECT_SUPERSET_DIR_NAME,
		URLS_FILE_NAME,
	);

	if (!existsSync(urlsPath)) {
		return { exists: false, urls: null, error: null };
	}

	let content: string;
	try {
		content = readFileSync(urlsPath, "utf-8");
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			exists: true,
			urls: null,
			error: `Failed to read urls.json: ${message}`,
		};
	}

	let parsed: UrlsConfig;
	try {
		parsed = JSON.parse(content) as UrlsConfig;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			exists: true,
			urls: null,
			error: `Invalid JSON in urls.json: ${message}`,
		};
	}

	if (typeof parsed !== "object" || parsed === null) {
		return {
			exists: true,
			urls: null,
			error: "urls.json must contain a JSON object",
		};
	}

	if (!("urls" in parsed)) {
		return {
			exists: true,
			urls: null,
			error: "urls.json is missing required field 'urls'",
		};
	}

	if (!Array.isArray(parsed.urls)) {
		return {
			exists: true,
			urls: null,
			error: "'urls' field must be an array",
		};
	}

	const validatedUrls: Array<{ url: string; label: string }> = [];

	for (let i = 0; i < parsed.urls.length; i++) {
		const entry = parsed.urls[i] as UrlEntry;
		const result = validateUrlEntry(entry, i);

		if (!result.valid) {
			return { exists: true, urls: null, error: result.error };
		}

		validatedUrls.push({ url: result.url, label: result.label });
	}

	return { exists: true, urls: validatedUrls, error: null };
}

/**
 * Check if a static URLs configuration file exists for a worktree.
 *
 * @param worktreePath - Path to the workspace's worktree directory
 * @returns true if .superset/urls.json exists
 */
export function hasStaticUrlsConfig(worktreePath: string): boolean {
	const urlsPath = join(
		worktreePath,
		PROJECT_SUPERSET_DIR_NAME,
		URLS_FILE_NAME,
	);
	return existsSync(urlsPath);
}

import fs from "node:fs";
import path from "node:path";
import { MAX_PLAN_FILE_SIZE, PLAN_ID_PATTERN, PLANS_TMP_DIR } from "./paths";

export type ValidatePlanResult =
	| { ok: true; content: string }
	| { ok: false; error: string };

/**
 * Validates a plan file path is safe and reads its content.
 * Security measures:
 * - Path must be within PLANS_TMP_DIR (prevents directory traversal)
 * - Filename must match plan ID pattern (alphanumeric + hyphens)
 * - File size must be under MAX_PLAN_FILE_SIZE (prevents renderer freeze)
 */
export async function validateAndReadPlanFile(
	filePath: string,
): Promise<ValidatePlanResult> {
	try {
		// Resolve to canonical path (prevents ../ traversal)
		const resolvedPath = path.resolve(filePath);

		// Check file exists before realpath (realpath fails on non-existent files)
		const stats = await fs.promises.stat(resolvedPath).catch(() => null);
		if (!stats) {
			return { ok: false, error: "File does not exist" };
		}

		// Get real path (resolves symlinks)
		const realPath = await fs.promises.realpath(resolvedPath).catch(() => null);
		if (!realPath) {
			return { ok: false, error: "Could not resolve file path" };
		}

		// Must be within PLANS_TMP_DIR (use path.sep to prevent /plans-evil/ bypass)
		const normalizedDir = PLANS_TMP_DIR.endsWith(path.sep)
			? PLANS_TMP_DIR
			: PLANS_TMP_DIR + path.sep;
		if (!realPath.startsWith(normalizedDir)) {
			return { ok: false, error: "Path outside allowed directory" };
		}

		// Filename must match pattern
		const filename = path.basename(realPath);
		const planId = filename.replace(/\.md$/, "");
		if (!PLAN_ID_PATTERN.test(planId)) {
			return { ok: false, error: "Invalid plan ID format" };
		}

		// Check file size
		if (stats.size > MAX_PLAN_FILE_SIZE) {
			return { ok: false, error: "Plan file too large" };
		}

		const content = await fs.promises.readFile(realPath, "utf-8");
		return { ok: true, content };
	} catch (error) {
		console.error("[plans/validate] Error validating plan file:", error);
		return { ok: false, error: "Failed to read plan file" };
	}
}

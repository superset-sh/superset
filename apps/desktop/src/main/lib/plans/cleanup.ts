import fs from "node:fs";
import path from "node:path";
import { PLANS_TMP_DIR } from "./paths";

/** Maximum age for plan files before cleanup (24 hours) */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Cleans up old plan files from the temp directory.
 * Best-effort, non-blocking - errors are logged but don't throw.
 * Should be called on app startup.
 */
export async function cleanupOldPlanFiles(): Promise<void> {
	try {
		// Ensure directory exists before reading
		await fs.promises.mkdir(PLANS_TMP_DIR, { recursive: true });

		const files = await fs.promises.readdir(PLANS_TMP_DIR);
		const now = Date.now();

		for (const file of files) {
			if (!file.endsWith(".md")) continue;

			const filePath = path.join(PLANS_TMP_DIR, file);
			const stats = await fs.promises.stat(filePath).catch(() => null);

			if (stats && now - stats.mtimeMs > MAX_AGE_MS) {
				await fs.promises.unlink(filePath).catch(() => {
					// Best-effort deletion - ignore errors
				});
			}
		}
	} catch {
		// Best-effort, non-blocking - ignore all errors
		console.log("[plans/cleanup] Cleanup skipped or failed");
	}
}

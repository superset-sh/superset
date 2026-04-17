/**
 * One-time migration from the old hotkey storage (main process JSON file via tRPC)
 * to the new localStorage-based Zustand store.
 *
 * Marker key is bumped (`-v2`) so users who migrated on the pre-sanitizer
 * build re-run once and get their corrupt entries dropped.
 */

import { electronTrpcClient } from "renderer/lib/trpc-client";
import { PLATFORM } from "./registry";
import { isUSCompatibleLayout } from "./utils/detectUSLayout";
import { sanitizeOverride } from "./utils/sanitizeOverride";

const MIGRATION_MARKER_KEY = "hotkey-overrides-migrated-v2";

const PLATFORM_MAP = {
	mac: "darwin",
	windows: "win32",
	linux: "linux",
} as const;

export async function migrateHotkeyOverrides(): Promise<void> {
	if (localStorage.getItem(MIGRATION_MARKER_KEY)) return;

	try {
		const oldState = await electronTrpcClient.uiState.hotkeys.get.query();
		const oldPlatformKey = PLATFORM_MAP[PLATFORM];
		const oldOverrides = oldState?.byPlatform?.[oldPlatformKey];
		if (!oldOverrides || Object.keys(oldOverrides).length === 0) {
			localStorage.setItem(MIGRATION_MARKER_KEY, "1");
			console.log("[hotkeys] Migration skipped — no old overrides found");
			return;
		}

		const assumeUSMacLayout =
			PLATFORM === "mac" ? await isUSCompatibleLayout() : true;

		const cleaned: Record<string, string | null> = {};
		let dropped = 0;
		for (const [id, raw] of Object.entries(oldOverrides)) {
			const sanitized = sanitizeOverride(raw, { assumeUSMacLayout });
			if (sanitized === undefined) {
				dropped++;
				continue;
			}
			cleaned[id] = sanitized;
		}

		localStorage.setItem(
			"hotkey-overrides",
			JSON.stringify({ state: { overrides: cleaned }, version: 0 }),
		);
		localStorage.setItem(MIGRATION_MARKER_KEY, "1");
		console.log(
			`[hotkeys] Migrated ${Object.keys(cleaned).length} override(s)` +
				(dropped > 0 ? `, dropped ${dropped} invalid` : ""),
		);
	} catch (error) {
		// Marker intentionally not set — transient tRPC failures retry next boot.
		console.log("[hotkeys] Migration failed, will retry next boot:", error);
	}
}

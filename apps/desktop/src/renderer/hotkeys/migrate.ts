/**
 * One-time migration from the old hotkey storage (main process JSON file via tRPC)
 * to the new localStorage-based Zustand store.
 *
 * Marker key is bumped (`-v2`) so users who migrated on the pre-sanitizer
 * build re-run once and get their corrupt entries dropped.
 *
 * SUNSET: this whole file (plus MAC_US_DEAD_KEYS in sanitizeOverride.ts) can
 * be deleted once we're confident every active user has the v2 marker set
 * — propose 2026-08 (~3 months after April rollout). The migration call in
 * routes/_authenticated/layout.tsx and the layout-id query in this file go
 * with it.
 */

import { electronTrpcClient } from "renderer/lib/trpc-client";
import { PLATFORM } from "./registry";
import { sanitizeOverride } from "./utils/sanitizeOverride";

const MIGRATION_MARKER_KEY = "hotkey-overrides-migrated-v2";

const PLATFORM_MAP = {
	mac: "darwin",
	windows: "win32",
	linux: "linux",
} as const;

// Heuristic: if the user's KeyA/KeyQ/.../Quote produce US-ANSI glyphs, the
// MAC_US_DEAD_KEYS table can safely be applied to recover Option-glyph v1
// overrides. Includes USInternational-PC (US-compatible). Excludes Dvorak,
// QWERTZ, AZERTY, etc. — those fail-close to dropping the entry.
function isUSCompatibleKeymap(unshifted: Record<string, string>): boolean {
	return (
		unshifted.KeyA === "a" &&
		unshifted.KeyQ === "q" &&
		unshifted.KeyW === "w" &&
		unshifted.KeyZ === "z" &&
		unshifted.Semicolon === ";" &&
		unshifted.Quote === "'"
	);
}

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

		// Non-Mac platforms aren't affected by Option dead keys. On Mac, ask
		// the main-process keyboard layout service (native-keymap) for the
		// authoritative current layout. Empty unshifted → still booting →
		// fail closed.
		let assumeUSMacLayout = true;
		if (PLATFORM === "mac") {
			const layout = await electronTrpcClient.keyboardLayout.get.query();
			assumeUSMacLayout = isUSCompatibleKeymap(layout.unshifted);
		}

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

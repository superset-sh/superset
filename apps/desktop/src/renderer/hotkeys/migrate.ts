/**
 * One-time migration from the old hotkey storage (main process JSON file via tRPC)
 * to the new localStorage-based Zustand store.
 *
 * No-op if the new store key already exists (Zustand persist creates it on first init).
 */

import { electronTrpcClient } from "renderer/lib/trpc-client";
import { PLATFORM } from "./registry";
import { canonicalizeChord, MODIFIERS } from "./utils/resolveHotkeyFromEvent";

const PLATFORM_MAP = {
	mac: "darwin",
	windows: "win32",
	linux: "linux",
} as const;

/**
 * Drops pre-fix garbage (`ctrl+control`, `ctrl+shift+@`, `meta+[`) that the
 * old recorder could produce and that would never match `event.code`-based
 * dispatch. `null` is preserved as explicit unassignment; `undefined` means
 * drop the entry.
 */
function sanitizeOverride(value: unknown): string | null | undefined {
	if (value === null) return null;
	if (typeof value !== "string" || !value.trim()) return undefined;
	const canonical = canonicalizeChord(value);
	const keys = canonical.split("+").filter((p) => !MODIFIERS.has(p));
	if (keys.length !== 1 || !/^[a-z0-9]+$/.test(keys[0])) return undefined;
	return canonical;
}

export async function migrateHotkeyOverrides(): Promise<void> {
	if (localStorage.getItem("hotkey-overrides")) {
		console.log("[hotkeys] Migration skipped — new store already exists");
		return;
	}

	try {
		const oldState = await electronTrpcClient.uiState.hotkeys.get.query();
		const oldPlatformKey = PLATFORM_MAP[PLATFORM];
		const oldOverrides = oldState?.byPlatform?.[oldPlatformKey];
		if (!oldOverrides || Object.keys(oldOverrides).length === 0) {
			console.log("[hotkeys] Migration skipped — no old overrides found");
			return;
		}

		const cleaned: Record<string, string | null> = {};
		let dropped = 0;
		for (const [id, raw] of Object.entries(oldOverrides)) {
			const sanitized = sanitizeOverride(raw);
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
		console.log(
			`[hotkeys] Migrated ${Object.keys(cleaned).length} override(s)` +
				(dropped > 0 ? `, dropped ${dropped} invalid` : ""),
		);
	} catch (error) {
		console.log("[hotkeys] Migration failed, starting fresh:", error);
	}
}

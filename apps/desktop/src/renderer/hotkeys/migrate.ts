/**
 * One-time migration from the old hotkey storage (main process JSON file via tRPC)
 * to the new localStorage-based Zustand store.
 */

import { electronTrpcClient } from "renderer/lib/trpc-client";
import { PLATFORM } from "./registry";

const PLATFORM_MAP = {
	mac: "darwin",
	windows: "win32",
	linux: "linux",
} as const;

const STORE_KEY = "hotkey-overrides";
const MIGRATED_FLAG = "hotkey-overrides-migrated";

// The new registry uses code-based names for punctuation (e.g. "bracketleft")
// because react-hotkeys-hook matches on KeyboardEvent.code. The old registry
// stored the literal character ("["). Translate token-by-token so a user's
// "meta+[" override lands as "meta+bracketleft" in the new store.
const PUNCT_TO_CODE: Record<string, string> = {
	"[": "bracketleft",
	"]": "bracketright",
	",": "comma",
	".": "period",
	"/": "slash",
	"\\": "backslash",
	";": "semicolon",
	"'": "quote",
	"`": "backquote",
	"-": "minus",
	"=": "equal",
};

function translateKeyString(keys: string): string {
	return keys
		.split("+")
		.map((token) => PUNCT_TO_CODE[token] ?? token)
		.join("+");
}

export async function migrateHotkeyOverrides(): Promise<void> {
	if (localStorage.getItem(MIGRATED_FLAG)) return;

	try {
		const oldState = await electronTrpcClient.uiState.hotkeys.get.query();
		const oldPlatformKey = PLATFORM_MAP[PLATFORM];
		const oldOverrides = oldState?.byPlatform?.[oldPlatformKey];

		if (oldOverrides && Object.keys(oldOverrides).length > 0) {
			const translated: Record<string, string | null> = {};
			for (const [id, keys] of Object.entries(oldOverrides)) {
				translated[id] = keys === null ? null : translateKeyString(keys);
			}
			localStorage.setItem(
				STORE_KEY,
				JSON.stringify({ state: { overrides: translated }, version: 0 }),
			);
			console.log(
				`[hotkeys] Migrated ${Object.keys(translated).length} override(s)`,
			);
		} else {
			console.log("[hotkeys] Migration skipped — no old overrides found");
		}
	} catch (error) {
		console.log("[hotkeys] Migration failed, starting fresh:", error);
	}

	localStorage.setItem(MIGRATED_FLAG, "1");
}

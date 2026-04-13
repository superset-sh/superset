/**
 * Migrates and sanitizes hotkey overrides on renderer boot.
 *
 * Two paths, gated by a single marker so each runs at most once per user:
 *
 * 1. Fresh install / never migrated — copy from the old main-process tRPC
 *    store into localStorage, running each value through `sanitizeOverride`.
 * 2. Already migrated on a pre-sanitizer build — re-sanitize whatever is in
 *    localStorage in place, dropping garbage that the old recorder could
 *    produce (`ctrl+control`, `ctrl+shift+@`, `meta+[`). Without this pass,
 *    users who migrated before the sanitizer shipped would keep their
 *    corrupt entries forever because the original guard short-circuited on
 *    the presence of the `hotkey-overrides` key.
 */

import { electronTrpcClient } from "renderer/lib/trpc-client";
import { PLATFORM } from "./registry";
import { sanitizeOverride } from "./utils/sanitizeOverride";

const STORE_KEY = "hotkey-overrides";
const SANITIZED_MARKER_KEY = "hotkey-overrides-sanitized-v1";

const PLATFORM_MAP = {
	mac: "darwin",
	windows: "win32",
	linux: "linux",
} as const;

export async function migrateHotkeyOverrides(): Promise<void> {
	if (localStorage.getItem(SANITIZED_MARKER_KEY)) return;

	const existing = localStorage.getItem(STORE_KEY);
	if (existing) {
		resanitizeExisting(existing);
		localStorage.setItem(SANITIZED_MARKER_KEY, "1");
		return;
	}

	await migrateFromTrpc();
	localStorage.setItem(SANITIZED_MARKER_KEY, "1");
}

function resanitizeExisting(raw: string): void {
	try {
		const parsed = JSON.parse(raw) as {
			state?: { overrides?: Record<string, unknown> };
			version?: number;
		};
		const current = parsed.state?.overrides ?? {};
		const { cleaned, dropped } = sanitizeAll(current);
		localStorage.setItem(
			STORE_KEY,
			JSON.stringify({
				state: { overrides: cleaned },
				version: parsed.version ?? 0,
			}),
		);
		if (dropped > 0) {
			console.log(
				`[hotkeys] Re-sanitized ${Object.keys(cleaned).length} override(s), dropped ${dropped} invalid`,
			);
		}
	} catch (error) {
		console.log("[hotkeys] Re-sanitization failed:", error);
	}
}

async function migrateFromTrpc(): Promise<void> {
	try {
		const oldState = await electronTrpcClient.uiState.hotkeys.get.query();
		const oldPlatformKey = PLATFORM_MAP[PLATFORM];
		const oldOverrides = oldState?.byPlatform?.[oldPlatformKey];
		if (!oldOverrides || Object.keys(oldOverrides).length === 0) {
			console.log("[hotkeys] Migration skipped — no old overrides found");
			return;
		}

		const { cleaned, dropped } = sanitizeAll(oldOverrides);
		localStorage.setItem(
			STORE_KEY,
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

function sanitizeAll(source: Record<string, unknown>): {
	cleaned: Record<string, string | null>;
	dropped: number;
} {
	const cleaned: Record<string, string | null> = {};
	let dropped = 0;
	for (const [id, raw] of Object.entries(source)) {
		const sanitized = sanitizeOverride(raw);
		if (sanitized === undefined) {
			dropped++;
			continue;
		}
		cleaned[id] = sanitized;
	}
	return { cleaned, dropped };
}

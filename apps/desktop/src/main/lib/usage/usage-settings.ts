import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	ensureSupersetHomeDirExists,
	SUPERSET_HOME_DIR,
} from "main/lib/app-environment";
import {
	DEFAULT_USAGE_DISPLAY_SETTINGS,
	type UsageDisplaySettings,
} from "./usage-snapshot";

const SETTINGS_PATH = join(SUPERSET_HOME_DIR, "usage-settings.json");

let cached: UsageDisplaySettings | null = null;

function coerce(raw: unknown): UsageDisplaySettings {
	const source = (
		typeof raw === "object" && raw !== null ? raw : {}
	) as Partial<UsageDisplaySettings>;
	return {
		showSidebarBadge:
			source.showSidebarBadge ?? DEFAULT_USAGE_DISPLAY_SETTINGS.showSidebarBadge,
		showTrayPercentage:
			source.showTrayPercentage ??
			DEFAULT_USAGE_DISPLAY_SETTINGS.showTrayPercentage,
		notifyAt80Pct:
			source.notifyAt80Pct ?? DEFAULT_USAGE_DISPLAY_SETTINGS.notifyAt80Pct,
		notifyAt95Pct:
			source.notifyAt95Pct ?? DEFAULT_USAGE_DISPLAY_SETTINGS.notifyAt95Pct,
	};
}

export function getUsageDisplaySettings(): UsageDisplaySettings {
	if (cached) return cached;
	try {
		cached = coerce(JSON.parse(readFileSync(SETTINGS_PATH, "utf8")));
	} catch {
		cached = { ...DEFAULT_USAGE_DISPLAY_SETTINGS };
	}
	return cached;
}

export function updateUsageDisplaySettings(
	patch: Partial<UsageDisplaySettings>,
): UsageDisplaySettings {
	const next = coerce({ ...getUsageDisplaySettings(), ...patch });
	cached = next;
	try {
		ensureSupersetHomeDirExists();
		writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2), {
			mode: 0o600,
		});
	} catch (error) {
		console.warn("[usage] Failed to persist usage settings:", error);
	}
	return next;
}

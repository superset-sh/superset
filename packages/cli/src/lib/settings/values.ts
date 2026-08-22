import {
	type HostGitSettings,
	readHostGitSettings,
	writeHostGitSetting,
} from "./host-settings";
import { readSettingsRow, writeSetting } from "./local-settings";
import { notifyDesktopSettingsChanged } from "./notify";
import type { SettingDefinition, SettingValue } from "./registry";

export interface SettingReading {
	value: SettingValue | null;
	isSet: boolean;
	/** Present when the value couldn't be read (e.g. host service offline). */
	note?: string;
}

type HostGitKey = "branchPrefixMode" | "branchPrefixCustom" | "worktreeBaseDir";

function hostReading(host: HostGitSettings, key: HostGitKey): SettingReading {
	const value = host[key];
	if (key === "branchPrefixMode") {
		return { value, isSet: value !== "none" };
	}
	return { value, isSet: value !== null };
}

/** Read one setting from its owning store. Throws when the host service is required but down. */
export async function readSettingValue(
	def: SettingDefinition,
): Promise<SettingReading> {
	if (def.store === "hostService") {
		return hostReading(await readHostGitSettings(), def.key as HostGitKey);
	}
	const row = readSettingsRow();
	const stored = (row?.[def.key] ?? null) as SettingValue | null;
	return { value: stored, isSet: stored !== null };
}

/** Read all settings at once; host-service failures degrade to a note instead of throwing. */
export async function readAllSettings(
	defs: SettingDefinition[],
): Promise<Map<string, SettingReading>> {
	const row = readSettingsRow();
	const needsHost = defs.some((def) => def.store === "hostService");
	let host: HostGitSettings | null = null;
	let hostError: string | undefined;
	if (needsHost) {
		try {
			host = await readHostGitSettings();
		} catch {
			hostError = "host service not running";
		}
	}
	const readings = new Map<string, SettingReading>();
	for (const def of defs) {
		if (def.store === "hostService") {
			readings.set(
				def.key,
				host
					? hostReading(host, def.key as HostGitKey)
					: { value: null, isSet: false, note: hostError },
			);
		} else {
			const stored = (row?.[def.key] ?? null) as SettingValue | null;
			readings.set(def.key, { value: stored, isSet: stored !== null });
		}
	}
	return readings;
}

/**
 * Write one setting to its owning store (null = reset to default).
 * Returns whether a running desktop app acknowledged the refresh nudge.
 */
export async function writeSettingValue(
	def: SettingDefinition,
	value: SettingValue | null,
): Promise<boolean> {
	if (def.store === "hostService") {
		await writeHostGitSetting(def.key as HostGitKey, value as string | null);
		// Keep the legacy local.db columns in sync for v1 surfaces; the host
		// service row above is what the current UI reads.
		try {
			writeSetting(def.key, value);
		} catch {}
	} else {
		writeSetting(def.key, value);
	}
	return notifyDesktopSettingsChanged();
}

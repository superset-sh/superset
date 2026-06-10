export const DESKTOP_RUNTIME_FLAGS_STORAGE_KEY = "superset.desktopRuntimeFlags";

export interface DesktopRuntimeFlags {
	disableAutoUpdate: boolean;
	disableAnalytics: boolean;
}

export const defaultDesktopRuntimeFlags: DesktopRuntimeFlags = {
	disableAutoUpdate: false,
	disableAnalytics: false,
};

export function isTruthyRuntimeFlag(value: string | undefined): boolean {
	const normalized = value?.trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

export function normalizeDesktopRuntimeFlags(
	value: Partial<DesktopRuntimeFlags> | null | undefined,
): DesktopRuntimeFlags {
	return {
		disableAutoUpdate: value?.disableAutoUpdate ?? false,
		disableAnalytics: value?.disableAnalytics ?? false,
	};
}

export function getPostHogKeyOrNull(
	key: string | undefined,
	options?: { disabled?: boolean },
): string | null {
	if (options?.disabled) return null;

	const normalized = key?.trim().toLowerCase();
	if (
		!normalized ||
		normalized === "disabled" ||
		normalized === "false" ||
		normalized === "phc_local_dev_disabled"
	) {
		return null;
	}
	return key ?? null;
}

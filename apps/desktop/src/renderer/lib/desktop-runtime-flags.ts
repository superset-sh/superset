import { env } from "renderer/env.renderer";
import {
	DESKTOP_RUNTIME_FLAGS_STORAGE_KEY,
	type DesktopRuntimeFlags,
	getPostHogKeyOrNull,
	normalizeDesktopRuntimeFlags,
	trimTrailingSlash,
} from "shared/desktop-runtime-flags";

export function readDesktopRuntimeFlagsFromLocalStorage(): DesktopRuntimeFlags {
	if (typeof window === "undefined") {
		return normalizeDesktopRuntimeFlags(undefined);
	}

	try {
		const raw = window.localStorage.getItem(DESKTOP_RUNTIME_FLAGS_STORAGE_KEY);
		return normalizeDesktopRuntimeFlags(raw ? JSON.parse(raw) : undefined);
	} catch {
		return normalizeDesktopRuntimeFlags(undefined);
	}
}

export function writeDesktopRuntimeFlagsToLocalStorage(
	flags: DesktopRuntimeFlags,
): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(
		DESKTOP_RUNTIME_FLAGS_STORAGE_KEY,
		JSON.stringify(normalizeDesktopRuntimeFlags(flags)),
	);
}

export function getRuntimeApiUrl(): string {
	return trimTrailingSlash(env.NEXT_PUBLIC_API_URL);
}

export function getRuntimeElectricUrl(): string {
	return trimTrailingSlash(env.NEXT_PUBLIC_ELECTRIC_URL);
}

export function getRendererPostHogKey(key: string | undefined): string | null {
	return getPostHogKeyOrNull(key, {
		disabled: readDesktopRuntimeFlagsFromLocalStorage().disableAnalytics,
	});
}

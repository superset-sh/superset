import type { AppRef, ExternalApp } from "@superset/local-db";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	customAppToOption,
	getAppOption,
	type OpenInExternalAppOption,
} from "./constants";

/**
 * User-defined apps from settings, shaped like the built-in menu options.
 *
 * Fetched here rather than threaded as a prop so every "Open in" surface picks
 * custom apps up automatically — the query is cached by tRPC, so the repeated
 * calls across menus cost one request.
 */
export function useCustomApps(): OpenInExternalAppOption[] {
	const { data } = electronTrpc.settings.getCustomApps.useQuery();
	return (data ?? []).map(customAppToOption);
}

/**
 * Resolves any app ref — built-in or user-defined — to its menu option, so
 * trigger buttons can label/icon the active app even when it's a custom one.
 */
export function useAppOption(
	id: AppRef | null | undefined,
): OpenInExternalAppOption | undefined {
	const customApps = useCustomApps();
	if (!id) return undefined;
	return getAppOption(id) ?? customApps.find((app) => app.id === id);
}

/**
 * `useAppOption` with a built-in fallback for refs that no longer resolve —
 * a per-project default pointing at a custom app the user has since deleted.
 * Returns `null` only while custom apps are still loading, so a trigger never
 * fires the fallback for a ref that is merely not fetched yet.
 */
export function useAppOptionWithFallback(
	id: AppRef | null | undefined,
	fallback: ExternalApp,
): OpenInExternalAppOption | null {
	const { data, isSuccess, isError } =
		electronTrpc.settings.getCustomApps.useQuery();
	const customApps = (data ?? []).map(customAppToOption);
	const resolved = id
		? (getAppOption(id) ?? customApps.find((app) => app.id === id))
		: undefined;
	if (resolved) return resolved;
	if (!isSuccess && !isError) return null;
	return getAppOption(fallback) ?? null;
}

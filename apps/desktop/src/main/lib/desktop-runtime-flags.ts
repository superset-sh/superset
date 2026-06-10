import { env } from "main/env.main";
import {
	type DesktopRuntimeFlags,
	getPostHogKeyOrNull,
	isTruthyRuntimeFlag,
	normalizeDesktopRuntimeFlags,
} from "shared/desktop-runtime-flags";
import { appState } from "./app-state";

export function getDesktopRuntimeFlags(): DesktopRuntimeFlags {
	try {
		return normalizeDesktopRuntimeFlags(appState.data.desktopRuntimeFlags);
	} catch {
		return normalizeDesktopRuntimeFlags(undefined);
	}
}

export function isAutoUpdateDisabledByRuntimeFlags(): boolean {
	return (
		getDesktopRuntimeFlags().disableAutoUpdate ||
		isTruthyRuntimeFlag(process.env.SUPERSET_DISABLE_AUTO_UPDATE)
	);
}

export function getMainPostHogKey(key: string | undefined): string | null {
	return getPostHogKeyOrNull(key, {
		disabled: getDesktopRuntimeFlags().disableAnalytics,
	});
}

export function getMainApiUrl(): string {
	return env.NEXT_PUBLIC_API_URL;
}

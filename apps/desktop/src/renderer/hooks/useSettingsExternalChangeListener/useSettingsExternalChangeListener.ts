import { useQueryClient } from "@tanstack/react-query";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { FONT_SETTINGS_QUERY_KEY } from "renderer/lib/font-settings";
import { useThemeStore } from "renderer/stores/theme";
import { NOTIFICATION_EVENTS } from "shared/constants";
import type { Theme } from "shared/themes";

interface ExternalThemeState {
	activeThemeId: string;
	customThemes: Theme[];
	systemLightThemeId?: string;
	systemDarkThemeId?: string;
}

function isExternalThemeState(value: unknown): value is ExternalThemeState {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as ExternalThemeState).activeThemeId === "string"
	);
}

/**
 * Applies settings changes made outside the app (the `superset settings`
 * CLI POSTs /settings-changed after writing): re-applies canonical theme
 * state and refetches every settings query, so CLI changes appear live
 * without a window refocus or app restart.
 */
export function useSettingsExternalChangeListener() {
	const utils = electronTrpc.useUtils();
	const queryClient = useQueryClient();

	electronTrpc.notifications.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type !== NOTIFICATION_EVENTS.SETTINGS_EXTERNAL_CHANGE) return;
			const themeState = event.data?.themeState;
			if (isExternalThemeState(themeState)) {
				useThemeStore.getState().applyExternalThemeState(themeState);
			}
			void utils.settings.invalidate();
			// terminal + editor panes read typography through this custom key,
			// not the tRPC key space, so invalidate it explicitly
			void queryClient.invalidateQueries({ queryKey: FONT_SETTINGS_QUERY_KEY });
		},
	});
}

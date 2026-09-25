import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	FONT_SETTINGS_QUERY_KEY,
	type FontSettings,
} from "renderer/lib/font-settings";
import {
	getDefaultTerminalAppearance,
	resolveTerminalAppearance,
} from "renderer/lib/terminal/appearance";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { useTerminalTheme } from "renderer/stores/theme";

export const EMPTY_FONT_SETTINGS: FontSettings = {
	terminalFontFamily: null,
	terminalFontSize: null,
	terminalLineHeight: null,
	terminalLetterSpacing: null,
	terminalFontWeight: null,
	terminalLigatures: null,
	terminalMinimumContrast: null,
	terminalCursorStyle: null,
	terminalCursorBlink: null,
	editorFontFamily: null,
	editorFontSize: null,
	editorLineHeight: null,
	editorLetterSpacing: null,
	editorFontWeight: null,
	editorLigatures: null,
};

/**
 * Persists font settings with an optimistic update of both query caches (the
 * tRPC hook cache and the raw-key cache `useTerminalAppearance` reads) and
 * pushes terminal changes straight into live xterm runtimes so they repaint
 * before the round-trip completes.
 */
export function useFontSettingsMutation() {
	const utils = electronTrpc.useUtils();
	const queryClient = useQueryClient();
	const terminalTheme = useTerminalTheme();
	const fallbackTerminalTheme = useMemo(
		() => getDefaultTerminalAppearance().theme,
		[],
	);

	const syncTerminalRuntimes = useCallback(
		(settings: FontSettings) => {
			const appearance = resolveTerminalAppearance(
				terminalTheme ?? fallbackTerminalTheme,
				settings,
			);
			terminalRuntimeRegistry.updateAllAppearances(appearance);
		},
		[terminalTheme, fallbackTerminalTheme],
	);

	return electronTrpc.settings.setFontSettings.useMutation({
		onMutate: async (input) => {
			await Promise.all([
				utils.settings.getFontSettings.cancel(),
				queryClient.cancelQueries({ queryKey: FONT_SETTINGS_QUERY_KEY }),
			]);
			const previous = utils.settings.getFontSettings.getData();
			const previousV2 = queryClient.getQueryData<FontSettings>(
				FONT_SETTINGS_QUERY_KEY,
			);
			const next = {
				...EMPTY_FONT_SETTINGS,
				...previousV2,
				...previous,
				...input,
			} as FontSettings;
			utils.settings.getFontSettings.setData(undefined, next);
			queryClient.setQueryData(FONT_SETTINGS_QUERY_KEY, next);
			if (Object.keys(input).some((key) => key.startsWith("terminal"))) {
				syncTerminalRuntimes(next);
			}
			return { previous, previousV2 };
		},
		onError: (_err, input, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getFontSettings.setData(undefined, context.previous);
			}
			const rollback = context?.previousV2 ?? context?.previous;
			if (rollback === undefined) {
				queryClient.removeQueries({
					queryKey: FONT_SETTINGS_QUERY_KEY,
					exact: true,
				});
			} else {
				queryClient.setQueryData(FONT_SETTINGS_QUERY_KEY, rollback);
			}
			if (
				rollback !== undefined &&
				Object.keys(input).some((key) => key.startsWith("terminal"))
			) {
				syncTerminalRuntimes({ ...EMPTY_FONT_SETTINGS, ...rollback });
			}
		},
		onSettled: () => {
			void utils.settings.getFontSettings.invalidate();
			void queryClient.invalidateQueries({
				queryKey: FONT_SETTINGS_QUERY_KEY,
			});
		},
	});
}

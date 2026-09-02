import { Trans } from "@lingui/react/macro";
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
import {
	type FontSettingsUpdate,
	TypographySurfaceCard,
} from "./components/TypographySurfaceCard";
import { useSystemFonts } from "./hooks/useSystemFonts";

const EMPTY_FONT_SETTINGS: FontSettings = {
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

interface FontSettingSectionProps {
	showEditor?: boolean;
	showTerminal?: boolean;
}

export function FontSettingSection({
	showEditor = true,
	showTerminal = true,
}: FontSettingSectionProps) {
	const utils = electronTrpc.useUtils();
	const queryClient = useQueryClient();
	const terminalTheme = useTerminalTheme();
	const fallbackTerminalTheme = useMemo(
		() => getDefaultTerminalAppearance().theme,
		[],
	);

	const { data: fontSettings, isLoading } =
		electronTrpc.settings.getFontSettings.useQuery();

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

	const setFontSettings = electronTrpc.settings.setFontSettings.useMutation({
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

	const { fonts: systemFonts, isLoading: fontsLoading } = useSystemFonts();

	const settings = useMemo(
		() => ({ ...EMPTY_FONT_SETTINGS, ...fontSettings }),
		[fontSettings],
	);
	const mutateSettings = useCallback(
		(input: FontSettingsUpdate) => {
			setFontSettings.mutate(input);
		},
		[setFontSettings],
	);

	return (
		<section aria-labelledby="typography-title">
			<div className="mb-3">
				<h3 id="typography-title" className="text-sm font-medium mb-1">
					<Trans>Typography</Trans>
				</h3>
				<p className="text-xs text-muted-foreground">
					<Trans>
						Each surface has its own typography. Changes appear immediately in
						the live previews.
					</Trans>
				</p>
			</div>

			<div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
				{showEditor && (
					<TypographySurfaceCard
						variant="editor"
						settings={settings}
						isLoading={isLoading}
						onChange={mutateSettings}
						fonts={systemFonts}
						fontsLoading={fontsLoading}
					/>
				)}
				{showTerminal && (
					<TypographySurfaceCard
						variant="terminal"
						settings={settings}
						isLoading={isLoading}
						onChange={mutateSettings}
						fonts={systemFonts}
						fontsLoading={fontsLoading}
					/>
				)}
			</div>
		</section>
	);
}

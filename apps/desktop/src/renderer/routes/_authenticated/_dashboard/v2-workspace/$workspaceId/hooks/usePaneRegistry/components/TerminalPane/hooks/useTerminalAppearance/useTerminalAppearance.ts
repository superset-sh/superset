import { useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	DEFAULT_TERMINAL_FONT_FAMILY,
	DEFAULT_TERMINAL_FONT_SIZE,
	getDefaultTerminalAppearance,
	type TerminalAppearance,
} from "renderer/lib/terminal/appearance";
import { useTerminalTheme } from "renderer/stores/theme";

const fallbackTheme = getDefaultTerminalAppearance().theme;

export function useTerminalAppearance(): TerminalAppearance {
	const terminalTheme = useTerminalTheme();
	const { data: fontSettings } = electronTrpc.settings.getFontSettings.useQuery(
		undefined,
		{
			staleTime: 30_000,
		},
	);

	return useMemo(() => {
		const theme = terminalTheme ?? fallbackTheme;
		const fontFamily =
			fontSettings?.terminalFontFamily || DEFAULT_TERMINAL_FONT_FAMILY;
		const fontSize =
			fontSettings?.terminalFontSize ?? DEFAULT_TERMINAL_FONT_SIZE;

		return {
			theme,
			background: theme.background ?? "#151110",
			fontFamily,
			fontSize,
		};
	}, [terminalTheme, fontSettings]);
}

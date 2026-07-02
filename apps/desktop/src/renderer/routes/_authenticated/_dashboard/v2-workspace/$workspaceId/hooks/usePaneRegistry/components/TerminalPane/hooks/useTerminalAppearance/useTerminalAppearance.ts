import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	DEFAULT_TERMINAL_FONT_SIZE,
	DEFAULT_TERMINAL_FONT_WEIGHT,
	DEFAULT_TERMINAL_LINE_HEIGHT,
	getDefaultTerminalAppearance,
	sanitizeTerminalFontFamily,
	type TerminalAppearance,
} from "renderer/lib/terminal/appearance";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTerminalTheme } from "renderer/stores/theme";

const fallbackTheme = getDefaultTerminalAppearance().theme;

export function useTerminalAppearance(): TerminalAppearance {
	const terminalTheme = useTerminalTheme();
	const { data: fontSettings } = useQuery({
		queryKey: ["electron", "settings", "getFontSettings"],
		queryFn: () => electronTrpcClient.settings.getFontSettings.query(),
		staleTime: 30_000,
	});

	return useMemo(() => {
		const theme = terminalTheme ?? fallbackTheme;
		const fontFamily = sanitizeTerminalFontFamily(
			fontSettings?.terminalFontFamily,
		);
		const fontSize =
			fontSettings?.terminalFontSize ?? DEFAULT_TERMINAL_FONT_SIZE;
		const fontWeight =
			fontSettings?.terminalFontWeight ?? DEFAULT_TERMINAL_FONT_WEIGHT;
		const lineHeight =
			fontSettings?.terminalLineHeight ?? DEFAULT_TERMINAL_LINE_HEIGHT;

		return {
			theme,
			background: theme.background ?? "#151110",
			fontFamily,
			fontSize,
			fontWeight,
			lineHeight,
		};
	}, [terminalTheme, fontSettings]);
}

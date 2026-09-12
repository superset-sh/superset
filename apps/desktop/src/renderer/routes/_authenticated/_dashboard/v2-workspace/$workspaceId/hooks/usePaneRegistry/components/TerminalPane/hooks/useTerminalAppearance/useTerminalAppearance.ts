import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { FONT_SETTINGS_QUERY_KEY } from "renderer/lib/font-settings";
import {
	getDefaultTerminalAppearance,
	resolveTerminalAppearance,
	type TerminalAppearance,
} from "renderer/lib/terminal/appearance";
import { detectInstalledNerdFontFamilies } from "renderer/lib/terminal/appearance/installed-nerd-fonts";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTerminalTheme } from "renderer/stores/theme";

const fallbackTheme = getDefaultTerminalAppearance().theme;

export function useTerminalAppearance(): TerminalAppearance {
	const terminalTheme = useTerminalTheme();
	const { data: fontSettings } = useQuery({
		queryKey: FONT_SETTINGS_QUERY_KEY,
		queryFn: () => electronTrpcClient.settings.getFontSettings.query(),
		staleTime: 30_000,
	});
	// Installed Nerd Fonts join the font stack as icon-glyph fallbacks; the
	// enumeration is cached for the renderer's lifetime (module-level too, so
	// the query never re-runs the OS enumeration).
	const { data: installedIconFonts } = useQuery({
		queryKey: ["installed-nerd-font-families"],
		queryFn: detectInstalledNerdFontFamilies,
		staleTime: Number.POSITIVE_INFINITY,
	});

	return useMemo(() => {
		const theme = terminalTheme ?? fallbackTheme;
		return resolveTerminalAppearance(theme, fontSettings, installedIconFonts);
	}, [terminalTheme, fontSettings, installedIconFonts]);
}

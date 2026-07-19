import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { FONT_SETTINGS_QUERY_KEY } from "renderer/lib/font-settings";
import {
	getDefaultTerminalAppearance,
	resolveTerminalAppearance,
	type TerminalAppearance,
} from "renderer/lib/terminal/appearance";
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

	return useMemo(() => {
		const theme = terminalTheme ?? fallbackTheme;
		return resolveTerminalAppearance(theme, fontSettings);
	}, [terminalTheme, fontSettings]);
}

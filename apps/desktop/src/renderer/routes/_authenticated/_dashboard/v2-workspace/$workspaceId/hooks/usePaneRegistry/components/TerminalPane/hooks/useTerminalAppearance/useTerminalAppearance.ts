import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
	DEFAULT_TERMINAL_FONT_FAMILY,
	DEFAULT_TERMINAL_FONT_SIZE,
	getDefaultTerminalAppearance,
	type TerminalAppearance,
} from "renderer/lib/terminal/appearance";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTerminalTheme } from "renderer/stores/theme";

const fallbackTheme = getDefaultTerminalAppearance().theme;

export function useTerminalAppearance(): TerminalAppearance {
	const terminalTheme = useTerminalTheme();
	// Uses the imperative electron tRPC client rather than electronTrpc.X.useQuery
	// because @trpc/react-query's default React context is a module-level
	// singleton — nesting workspaceTrpc.Provider overrides it and silently
	// routes electronTrpc hooks through the host-service HTTP link.
	const { data: fontSettings } = useQuery({
		queryKey: ["electron", "settings", "getFontSettings"],
		queryFn: () => electronTrpcClient.settings.getFontSettings.query(),
		staleTime: 30_000,
	});

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

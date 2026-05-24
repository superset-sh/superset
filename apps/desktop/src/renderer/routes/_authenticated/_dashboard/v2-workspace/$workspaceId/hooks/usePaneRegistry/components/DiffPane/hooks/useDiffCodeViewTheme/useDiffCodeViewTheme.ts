import type { CodeViewOptions } from "@pierre/diffs";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import {
	getDiffsTheme,
	getDiffViewerStyle,
} from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import { useResolvedTheme, useTerminalTheme } from "renderer/stores/theme";
import type { DiffCommentThread } from "../useDiffAnnotations";

interface UseDiffCodeViewThemeOptions {
	diffStyle: "split" | "unified";
	expandUnchanged: boolean;
}

export function useDiffCodeViewTheme({
	diffStyle,
	expandUnchanged,
}: UseDiffCodeViewThemeOptions) {
	const activeTheme = useResolvedTheme();
	const terminalTheme = useTerminalTheme();
	const { data: fontSettings } = useQuery({
		queryKey: ["electron", "settings", "getFontSettings"],
		queryFn: () => electronTrpcClient.settings.getFontSettings.query(),
		staleTime: 30_000,
	});

	const parsedEditorFontSize =
		typeof fontSettings?.editorFontSize === "number"
			? fontSettings.editorFontSize
			: typeof fontSettings?.editorFontSize === "string"
				? Number.parseFloat(fontSettings.editorFontSize)
				: Number.NaN;
	const surfaceBg = terminalTheme?.background ?? "var(--background)";

	const style = useMemo(
		() => ({
			...getDiffViewerStyle(activeTheme, {
				fontFamily: fontSettings?.editorFontFamily ?? undefined,
				fontSize: Number.isFinite(parsedEditorFontSize)
					? parsedEditorFontSize
					: undefined,
			}),
			backgroundColor: surfaceBg,
		}),
		[
			activeTheme,
			fontSettings?.editorFontFamily,
			parsedEditorFontSize,
			surfaceBg,
		],
	);

	const options = useMemo<CodeViewOptions<DiffCommentThread>>(
		() => ({
			diffStyle,
			expandUnchanged,
			overflow: "wrap",
			stickyHeaders: true,
			theme: getDiffsTheme(activeTheme),
			themeType: activeTheme.type,
			layout: {
				paddingTop: 0,
				paddingBottom: 8,
				gap: 0,
			},
			// Degrade gracefully on lockfiles / minified bundles instead of
			// blocking the worker. Pierre's defaults are 100k for whole-file
			// tokenization and unbounded for the rest.
			tokenizeMaxLineLength: 5_000,
			tokenizeMaxLength: 200_000,
			maxLineDiffLength: 5_000,
			unsafeCSS: `
				* { user-select: text; -webkit-user-select: text; }
				[data-diffs-header='custom'] {
					padding: 0 !important;
				}
				/* Pierre sets --diffs-light-bg/--diffs-dark-bg
				 * inline on <pre data-diff> from the Shiki theme;
				 * inline beats :host so we override at the pre. */
				[data-diff] {
					--diffs-light-bg: ${surfaceBg} !important;
					--diffs-dark-bg: ${surfaceBg} !important;
				}
				/* Flatten the "N unmodified lines" strip flush to
				 * the pane edges (kills wrapper/content/expand-
				 * button rounding + inline gap on both
				 * line-info and line-info-basic). */
				[data-separator^='line-info'] [data-separator-wrapper],
				[data-separator^='line-info'] [data-separator-content],
				[data-separator^='line-info'] [data-expand-up],
				[data-separator^='line-info'] [data-expand-down],
				[data-separator^='line-info'] [data-expand-both] {
					border-radius: 0 !important;
					margin-inline: 0 !important;
					padding-inline: 0 !important;
				}
			`,
		}),
		[activeTheme, diffStyle, expandUnchanged, surfaceBg],
	);

	return { options, style };
}

import type { CodeViewOptions } from "@pierre/diffs";
import { useQuery } from "@tanstack/react-query";
import { type CSSProperties, useMemo } from "react";
import {
	resolveEditorLineHeight,
	resolveFontVariantLigatures,
} from "renderer/lib/editor-typography";
import { FONT_SETTINGS_QUERY_KEY } from "renderer/lib/font-settings";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { DEFAULT_CODE_EDITOR_FONT_SIZE } from "renderer/screens/main/components/WorkspaceView/components/CodeEditor/constants";
import {
	DIFF_POOL_RENDER_OPTIONS,
	getDiffsTheme,
	getDiffViewerStyle,
} from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import { useSettings } from "renderer/stores/settings";
import { useResolvedTheme, useTerminalTheme } from "renderer/stores/theme";
import type { DiffAnnotationMetadata } from "../useDiffAnnotations";

export function useDiffCodeViewTheme() {
	const diffStyle = useSettings((s) => s.diffStyle);
	const expandUnchanged = useSettings((s) => s.expandUnchanged);
	const activeTheme = useResolvedTheme();
	const terminalTheme = useTerminalTheme();
	const { data: fontSettings } = useQuery({
		queryKey: FONT_SETTINGS_QUERY_KEY,
		queryFn: () => electronTrpcClient.settings.getFontSettings.query(),
		staleTime: 30_000,
	});

	const parsedEditorFontSize =
		typeof fontSettings?.editorFontSize === "number"
			? fontSettings.editorFontSize
			: typeof fontSettings?.editorFontSize === "string"
				? Number.parseFloat(fontSettings.editorFontSize)
				: Number.NaN;
	const editorFontSize = Number.isFinite(parsedEditorFontSize)
		? parsedEditorFontSize
		: DEFAULT_CODE_EDITOR_FONT_SIZE;
	const surfaceBg = terminalTheme?.background ?? "var(--background)";

	const style = useMemo(
		() =>
			({
				...getDiffViewerStyle(activeTheme, {
					fontFamily: fontSettings?.editorFontFamily ?? undefined,
					fontSize: editorFontSize,
				}),
				"--diffs-line-height": `${resolveEditorLineHeight(
					editorFontSize,
					fontSettings?.editorLineHeight ?? undefined,
				)}px`,
				fontWeight: fontSettings?.editorFontWeight ?? undefined,
				letterSpacing:
					fontSettings?.editorLetterSpacing == null
						? undefined
						: `${fontSettings.editorLetterSpacing}px`,
				fontVariantLigatures: resolveFontVariantLigatures(
					fontSettings?.editorLigatures ?? undefined,
				),
				backgroundColor: surfaceBg,
			}) as CSSProperties,
		[
			activeTheme,
			fontSettings?.editorFontFamily,
			fontSettings?.editorFontWeight,
			fontSettings?.editorLetterSpacing,
			fontSettings?.editorLigatures,
			fontSettings?.editorLineHeight,
			editorFontSize,
			surfaceBg,
		],
	);

	const additionColor =
		activeTheme.type === "dark"
			? "var(--color-green-400)"
			: "var(--color-green-700)";
	const deletionColor =
		activeTheme.type === "dark"
			? "var(--color-red-500)"
			: "var(--color-red-700)";

	const options = useMemo<CodeViewOptions<DiffAnnotationMetadata>>(
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
			// Diff/tokenize options shared with the diff worker pool
			// (DIFF_POOL_RENDER_OPTIONS / buildDiffPoolRenderOptions) so the
			// per-item and pool configs can't diverge. They degrade gracefully
			// on lockfiles / minified bundles instead of blocking the worker.
			...DIFF_POOL_RENDER_OPTIONS,
			// tokenizeMaxLength is not a pool option, so it stays per-item.
			tokenizeMaxLength: 200_000,
			unsafeCSS: `
				* { user-select: text; -webkit-user-select: text; }
				/* Query container for slotted PR-comment bubbles
				 * (.diff-comment): lets them size to the visible code
				 * column via 100cqi instead of overflowing the pane. The
				 * cell width comes from the grid, so inline-size
				 * containment doesn't collapse it. */
				[data-line-annotation] {
					container-type: inline-size;
				}
				/* Container query host for the "Viewed" label visibility rule
				 * (see DiffHeaderMetadata: @min-[380px]/diff-header:inline). */
				[data-diffs-header='default'] {
					container-type: inline-size;
					container-name: diff-header;
				}
				/* Drop Pierre's status badge — we render a language-specific
				 * FileIcon in the prefix slot instead. */
				[data-diffs-header='default'] [data-change-icon] {
					display: none;
				}
				/* Match the file header bar to the DiffSectionBar background
				 * (bg-muted/40 flattened over the pane background) so the
				 * pinned section strip and the file title strip read as one.
				 * Pierre paints these with --diffs-bg (the diff surface
				 * color); the [data-sticky] selector is needed to out-rank
				 * Pierre's own two-attribute sticky rule. */
				[data-diffs-header='default'],
				[data-diffs-header='default'][data-sticky] {
					background-color: color-mix(
						in srgb,
						var(--muted) 40%,
						var(--background)
					);
				}
				[data-diffs-header='default'] [data-additions-count] {
					color: ${additionColor};
				}
				[data-diffs-header='default'] [data-deletions-count] {
					color: ${deletionColor};
				}
				[data-diffs-header='default'] [data-discard-button] {
					opacity: 0;
				}
				[data-diffs-header='default']:hover [data-discard-button],
				[data-diffs-header='default']:focus-within [data-discard-button] {
					opacity: 1;
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
		[
			activeTheme,
			additionColor,
			deletionColor,
			diffStyle,
			expandUnchanged,
			surfaceBg,
		],
	);

	return { options, style };
}

import { useMemo } from "react";
import { useResolvedTheme } from "renderer/stores/theme";
import { diffCardUnsafeCss } from "./diffCardUnsafeCss";
import { useDiffCodeViewTheme } from "./useDiffCodeViewTheme";

/**
 * useDiffCodeViewTheme plus the card-per-file look shared by the PR Code tab
 * and the v2-workspace DiffPane: bordered/rounded header+body pairs with a
 * real gap between files, PullRequestRow's additions/deletions colors, and
 * the app background instead of the terminal theme's.
 */
export function useDiffCardCodeViewTheme() {
	const { options, style } = useDiffCodeViewTheme();
	// Matches PullRequestRow's diff-stat colors exactly (text-emerald-600 /
	// [.dark_&]:text-[#34d399], text-red-600 / [.dark_&]:text-[#f87171]) so
	// the same file reads with the same additions/deletions colors in the PR
	// list and in a card-styled diff. Branched in JS rather than a `.dark`
	// selector in unsafeCSS — `.dark` lives on an ancestor outside Pierre's
	// shadow root, which a shadow-scoped stylesheet's descendant combinator
	// can't reach (see additionColor/deletionColor in useDiffCodeViewTheme
	// for the same pattern).
	const activeTheme = useResolvedTheme();
	const additionsColor =
		activeTheme.type === "dark" ? "#34d399" : "var(--color-emerald-600)";
	const deletionsColor =
		activeTheme.type === "dark" ? "#f87171" : "var(--color-red-600)";

	const cardOptions = useMemo(
		() => ({
			...options,
			// A visible gap between files is what makes the rounded header/diff
			// pair (diffCardUnsafeCss) read as separate cards rather than one
			// continuous, oddly-cornered block. Paddings carry over from the
			// base hook, rebuilt field-by-field because the rendered CodeView's
			// layout type requires all three concrete (CodeViewLayout) while
			// CodeViewOptions declares them optional.
			layout: {
				paddingTop: options.layout?.paddingTop ?? 0,
				paddingBottom: options.layout?.paddingBottom ?? 0,
				gap: 16,
			},
			unsafeCSS: `${options.unsafeCSS ?? ""}\n${diffCardUnsafeCss(additionsColor, deletionsColor)}`,
		}),
		[options, additionsColor, deletionsColor],
	);

	// useDiffCodeViewTheme sources its background from the *terminal* theme
	// (terminalTheme?.background ?? var(--background)), but card surfaces
	// draw their borders/gaps against the app's own var(--background) — the
	// two don't match (e.g. a flat white terminal background against the
	// app's slightly-off-white #f9f9fa). Most visible on the CodeView root's
	// own native scrollbar, which paints against whatever background that
	// element has.
	const cardStyle = useMemo(
		() => ({ ...style, backgroundColor: "var(--background)" }),
		[style],
	);

	return { options: cardOptions, style: cardStyle };
}

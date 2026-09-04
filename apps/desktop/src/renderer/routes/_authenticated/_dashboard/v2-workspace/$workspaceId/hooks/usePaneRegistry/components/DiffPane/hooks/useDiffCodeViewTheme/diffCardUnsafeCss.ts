// Extra unsafeCSS appended to (not replacing) useDiffCodeViewTheme's own —
// shared by every card-styled diff surface (the PR Code tab and the
// v2-workspace DiffPane) via useDiffCardCodeViewTheme.
//
// [data-diff]'s --diffs-light-bg/--diffs-dark-bg override: the shared hook
// sources its background from the *terminal* theme
// (terminalTheme?.background ?? var(--background)), but the terminal theme's
// default background doesn't match the app's own var(--background), and the
// card look draws its borders/gaps against the app background — re-overridden
// here (both are !important, so this wins by appearing later in the
// concatenated string) back to the token card surfaces actually use. The
// CodeView root's own `style.backgroundColor` gets the equivalent fix
// directly as a prop (see useDiffCardCodeViewTheme's style) since that one
// isn't reachable through unsafeCSS.
//
// Card-per-file look: Pierre has no single wrapping element around one
// file's header+content (confirmed live: [data-diffs-header]'s
// parentElement is the shadow root itself), so the "card" is an illusion
// built from two adjacent elements — the header gets rounded top corners,
// the diff body gets rounded bottom corners, matching borders on both meet
// with no gap between them, and layout.gap (set in useDiffCardCodeViewTheme)
// puts real space before the *next* file's header. Mirrors packages/ui's
// shared Card component's own recipe (rounded-xl border shadow-sm) rather
// than inventing a new one.
//
// A function (not a static string) because the additions/deletions colors
// are theme-branched in JS — mirroring useDiffCodeViewTheme's own
// additionColor/deletionColor — rather than relying on a `.dark` selector,
// which can't reach in from outside the shadow root the way a CSS custom
// property can.
export function diffCardUnsafeCss(
	additionsColor: string,
	deletionsColor: string,
): string {
	return `
	[data-diffs-header='default'] {
		border: 1px solid var(--border);
		border-bottom: none;
		border-top-left-radius: 0.75rem;
		border-top-right-radius: 0.75rem;
		box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
		/* Pushes [data-metadata] (the +/- count) to the card's right edge
		 * instead of leaving it flush against the filename — matches the
		 * PR list row's own diff-stat placement. Overrides the shared
		 * hook's flex-start (same selector, appended later so it wins). */
		justify-content: space-between;
		/* Pierre's own padding (0 16px) sits the collapse chevron well right
		 * of the Files pill above it (px-2 on the toolbar row, 8px) — cut to
		 * match so the two rows read as left-aligned. */
		padding-left: 8px;
	}
	/* Every header carries data-sticky from first render (confirmed live —
	 * it's there even scrolled to the very top), since position: sticky
	 * pins it while the code column scrolls behind it, not clipped away.
	 * Rounded top corners cut a notch out of the header's own background,
	 * and whatever's scrolled behind shows through that notch as a stray
	 * border/text sliver. Squaring the top only (the diff body below,
	 * [data-diff], keeps its rounded bottom) removes the notch entirely —
	 * reads as a flat toolbar cap on a rounded card, not a broken corner. */
	[data-diffs-header='default'][data-sticky] {
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}
	/* Each file gets its own shadow root — header, icon sprite, then the
	 * [data-diff] body (confirmed live) — and collapsing a file drops the
	 * body from that root, leaving the header as the whole card with no
	 * bottom edge. Close it: full border and rounded corners all around. A
	 * collapsed header's sticky box is only as tall as itself, so nothing
	 * ever scrolls behind its corners and the notch concern above doesn't
	 * apply. Any body element counts — Pierre renders plain-file items as
	 * [data-code] rather than [data-diff]. Same specificity as the sticky
	 * rule; later, so it wins. */
	[data-diffs-header='default']:not(:has(~ [data-diff], ~ [data-code], ~ [data-file])) {
		border-bottom: 1px solid var(--border);
		border-radius: 0.75rem;
	}
	/* Pierre renders the full relative path as one plain-text node here;
	 * replaced by our own filename/directory split rendered through
	 * renderHeaderFilenameSuffix, which sits right after this in the DOM so
	 * hiding it (rather than removing/reordering) keeps the same slot order. */
	[data-diffs-header='default'] [data-title] {
		display: none;
	}
	/* Pierre slots the renderHeaderFilenameSuffix output through an unstyled
	 * light-DOM wrapper div; as a flex item it defaults to min-width:auto and
	 * refuses to shrink below the full path's intrinsic width, painting the
	 * directory under the +/− counts in narrow panes. Let it shrink so the
	 * suffix's own min-w-0/truncate chain can ellipsize the directory
	 * (confirmed live: the wrapper measured 893px inside a 513px
	 * [data-header-content]). */
	[data-diffs-header='default'] slot[name='header-filename-suffix']::slotted(*) {
		min-width: 0;
		overflow: hidden;
	}
	/* Pierre lays [data-metadata] out as the +/- counts first, then the
	 * slotted header actions. The actions keep their width while hidden
	 * (opacity 0 until hover), which parked the counts a couple hundred
	 * pixels in from the card's right edge. Ordering the slotted actions
	 * first keeps the counts at the edge; the actions surface to their left. */
	[data-diffs-header='default'] [data-metadata] slot[name='header-metadata']::slotted(*) {
		order: -1;
	}
	/* Match PullRequestRow's diff-stat colors (the PR list view) instead of
	 * the shared hook's own green/red, which use a different palette. */
	[data-diffs-header='default'] [data-additions-count] {
		color: ${additionsColor};
	}
	[data-diffs-header='default'] [data-deletions-count] {
		color: ${deletionsColor};
	}
	[data-diff] {
		--diffs-light-bg: var(--background) !important;
		--diffs-dark-bg: var(--background) !important;
		border: 1px solid var(--border);
		border-top: none;
		border-bottom-left-radius: 0.75rem;
		border-bottom-right-radius: 0.75rem;
		box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
	}
	/* The shared hook zeroes this strip's own inline padding to sit flush
	 * with an edge-to-edge pane — but that leaves "N unmodified lines" text
	 * touching this card's left border with no breathing room. Restored
	 * (higher specificity: same selector, later in the concatenated string,
	 * so this !important wins over that one). */
	[data-separator^='line-info'] [data-separator-content] {
		padding-inline: 8px !important;
	}
`;
}

import type { CSSProperties } from "react";

interface PierreTreeStyleOptions {
	/** Row height in px — keep in sync with the model's `itemHeight`. */
	rowHeight: number;
	/** Per-level indent in px. */
	levelIndent: number;
	/**
	 * Include the search-bar chrome overrides. Only the searchable Files-tab
	 * explorer shows a search box; the changes-tab section trees don't.
	 */
	withSearchChrome?: boolean;
}

/**
 * Builds the inline `style` object that maps `@pierre/trees`' `--trees-*` CSS
 * variables onto our shadcn theme tokens, so the file tree picks up light/dark
 * automatically. Pierre resolves `*-override → theme tokens → defaults`, so the
 * overrides alone are enough — we never touch the theme tier. Custom properties
 * cascade through Pierre's shadow DOM, so setting them on the host element is
 * sufficient.
 *
 * Shared by the Files-tab explorer tree and the changes-tab section trees so
 * they read consistently; the row height / indent vary per surface.
 */
export function createPierreTreeStyle({
	rowHeight,
	levelIndent,
	withSearchChrome = false,
}: PierreTreeStyleOptions): CSSProperties {
	return {
		// Layout. Hover/selected backgrounds paint on the row element, which sits
		// inside the scroll container's `padding-inline`; zero the outer padding
		// so highlights bleed edge-to-edge. Padding/gap/icon size match the v2
		// ChangesFileList FileRow chrome (pl-3 pr-3, gap-1.5, size-3.5).
		"--trees-row-height-override": `${rowHeight}px`,
		"--trees-level-gap-override": `${levelIndent}px`,
		"--trees-padding-inline-override": "0",
		"--trees-item-margin-x-override": "0",
		"--trees-item-padding-x-override": "calc(var(--spacing) * 3)", // pl-3 / pr-3
		"--trees-item-row-gap-override": "calc(var(--spacing) * 1.5)", // gap-1.5
		"--trees-icon-width-override": "calc(var(--spacing) * 3.5)", // size-3.5
		"--trees-border-radius-override": "0",

		// Surface
		"--trees-bg-override": "var(--background)",
		"--trees-fg-override": "var(--foreground)",
		"--trees-fg-muted-override": "var(--muted-foreground)",
		// Match v2 FileRow's `hover:bg-accent/50` — translucent accent, not solid muted.
		"--trees-bg-muted-override":
			"color-mix(in oklab, var(--accent) 50%, transparent)",
		"--trees-accent-override": "var(--accent)",
		"--trees-border-color-override": "var(--border)",

		// Selected row matches v2's `bg-accent` / `text-accent-foreground` rows
		"--trees-selected-bg-override": "var(--accent)",
		"--trees-selected-fg-override": "var(--accent-foreground)",
		"--trees-selected-focused-border-color-override": "var(--ring)",

		// Focus ring
		"--trees-focus-ring-color-override": "var(--ring)",
		"--trees-focus-ring-offset-override": "0px",

		// Git status row tint — the green / yellow / red / blue Tailwind palette,
		// so a 'modified' file in the tree reads the same color as a 'modified'
		// badge elsewhere in the v2 chrome.
		"--trees-status-added-override": "oklch(0.627 0.194 149.214)",
		"--trees-status-untracked-override": "oklch(0.627 0.194 149.214)",
		"--trees-status-modified-override": "oklch(0.681 0.162 75.834)",
		"--trees-status-deleted-override": "oklch(0.577 0.245 27.325)",
		"--trees-status-renamed-override": "oklch(0.6 0.118 244.557)",
		"--trees-status-ignored-override": "var(--muted-foreground)",

		"--trees-font-size-override": "var(--text-xs)",

		// Search-bar chrome (Files tab only) — matches our text-input tokens.
		...(withSearchChrome
			? {
					"--trees-search-bg-override": "var(--input, var(--background))",
					"--trees-search-fg-override": "var(--foreground)",
				}
			: {}),
	} as CSSProperties;
}

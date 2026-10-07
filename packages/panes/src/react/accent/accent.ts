/**
 * CSS custom properties the workspace chrome reads to tint itself. Set them
 * on any ancestor of `<Workspace>`; unset, the chrome renders untinted.
 */
export const PANES_ACCENT_VARS = {
	/** A `background-image` layered over the tab bar, e.g. a flat gradient. */
	tabBarTint: "--panes-tab-bar-tint",
	/** A color drawn as a stripe along the top of the active tab. */
	activeTabAccent: "--panes-active-tab-accent",
	/** A `background-image` layered over every pane header. */
	paneHeaderTint: "--panes-pane-header-tint",
	/** A `background-image` layered over the workspace surface and active tab. */
	surfaceTint: "--panes-surface-tint",
} as const;

export type PanesAccentVar =
	(typeof PANES_ACCENT_VARS)[keyof typeof PANES_ACCENT_VARS];

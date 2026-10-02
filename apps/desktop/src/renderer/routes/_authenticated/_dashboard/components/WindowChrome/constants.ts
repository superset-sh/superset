/**
 * The row the window controls sit in while the sidebar is collapsed, spanning
 * the rail and the page. Opaque so the rail's copy can paint over its border.
 */
export const WINDOW_CHROME_BAND_CLASS =
	"shadow-[inset_0_-1px_0_var(--border)] bg-[color-mix(in_oklab,var(--muted)_45%,var(--background))] dark:bg-[color-mix(in_oklab,var(--muted)_35%,var(--background))]";

/**
 * macOS draws the window buttons centered 22.75pt from the window's top edge.
 * The controls beside them sit in a row centered on the same line, at a fixed
 * physical size whatever the page zoom.
 */
export const WINDOW_CONTROLS_ROW_TOP = 7;
export const WINDOW_CONTROLS_ROW_HEIGHT = 32;

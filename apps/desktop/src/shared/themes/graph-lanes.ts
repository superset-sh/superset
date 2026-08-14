import { getTerminalColors, type Theme } from "./types";

/** Lanes the commit graph can colour before it has to reuse one. */
export const GRAPH_LANE_COUNT = 8;

/**
 * Commit-graph lane colours, derived from the theme rather than stored on it.
 *
 * This mirrors `getEditorTheme`: prefer the theme's own ANSI palette, fall back
 * to the xterm defaults for its type. Lanes are deliberately not part of
 * `UIColors` — `import.ts` makes every UI colour optional, so eight new
 * required entries would invalidate every user-imported theme.
 *
 * Index order is hue order, not palette order. `assignLanes` hands consecutive
 * indices to lanes that end up side by side, so neighbours have to sit far
 * apart on the wheel; blue/green/red/cyan/magenta/yellow keeps every adjacent
 * pair at least ~120 degrees apart.
 *
 * ANSI only offers six chromatic hues, so slots 7 and 8 are lightness-shifted
 * copies of the first two. The other brightness rank is not usable: Monokai
 * (and most ports of it) set bright == standard for every hue, which would give
 * eight lanes only six colours. Those slots only appear once the sidebar is wide
 * enough for eight lanes (see `laneCapForWidth`).
 */
export function getGraphLanes(theme: Theme): string[] {
	const t = getTerminalColors(theme);
	// Dark themes read better on the bright ANSI set and light themes on the
	// standard set — the same split getEditorTheme uses for additions/deletions.
	const hues =
		theme.type === "dark"
			? [
					t.brightBlue,
					t.brightGreen,
					t.brightRed,
					t.brightCyan,
					t.brightMagenta,
					t.brightYellow,
				]
			: [t.blue, t.green, t.red, t.cyan, t.magenta, t.yellow];

	const toward = theme.type === "dark" ? "white" : "black";
	const shift = (color: string) =>
		`color-mix(in oklch, ${color} 62%, ${toward})`;

	return [...hues, shift(hues[0] as string), shift(hues[1] as string)];
}

/** CSS custom properties the graph reads, in lane order. */
export const GRAPH_LANE_CSS_VARS = Array.from(
	{ length: GRAPH_LANE_COUNT },
	(_, index) => `--graph-lane-${index + 1}`,
);

import type { PaneMruEntry } from "renderer/stores/pane-mru";

/**
 * An in-progress Ctrl+Tab cycle. `entries` is a snapshot taken when the cycle
 * started: re-deriving it mid-cycle would reorder candidates under the moving
 * highlight.
 */
export interface MruCycle {
	entries: PaneMruEntry[];
	selectedIndex: number;
}

export type CycleDirection = "forward" | "backward";

/**
 * Advance a cycle, starting one if none is running. Returns null when there is
 * nothing to switch to.
 *
 * Starting backward selects index 1, not 0 — index 0 is the pane you are
 * already on, which is what makes a single tap toggle to the previous pane.
 */
export function advanceCycle({
	cycle,
	entries,
	direction,
}: {
	cycle: MruCycle | null;
	entries: PaneMruEntry[];
	direction: CycleDirection;
}): MruCycle | null {
	if (cycle) {
		const count = cycle.entries.length;
		const delta = direction === "backward" ? 1 : -1;
		const selectedIndex = (cycle.selectedIndex + delta + count) % count;
		return { entries: cycle.entries, selectedIndex };
	}

	if (entries.length < 2) return null;

	return {
		entries,
		selectedIndex: direction === "backward" ? 1 : entries.length - 1,
	};
}

/** The entry a cycle would commit to right now. */
export function selectedEntry(cycle: MruCycle): PaneMruEntry | undefined {
	return cycle.entries[cycle.selectedIndex];
}

/**
 * Modifier keys whose release commits an in-progress cycle.
 *
 * The switcher's bindings are user-remappable in Settings → Keyboard, so
 * matching only "Control" would strand the overlay for anyone who rebinds to
 * Alt or Cmd.
 *
 * Shift is deliberately excluded: Ctrl+Shift+Tab steps backwards, and the user
 * releases Shift while still holding Ctrl to keep cycling. Treating that as a
 * commit would end the cycle a step early.
 */
const CYCLE_MODIFIERS = new Set(["Control", "Alt", "Meta"]);

export function isCycleModifier(key: string): boolean {
	return CYCLE_MODIFIERS.has(key);
}

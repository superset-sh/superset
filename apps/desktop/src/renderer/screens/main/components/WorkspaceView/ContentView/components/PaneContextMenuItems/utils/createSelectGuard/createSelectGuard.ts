/**
 * Guards a context-menu item's `onSelect` against the right-click that
 * opened the menu. On Linux/Wayland, the `mouseup` from the opening
 * contextmenu event can fall through to a menu item that happens to land
 * under the cursor — the destructive "Close Pane" item at the bottom of
 * the menu is the visible failure mode (issue #4939). Selections that
 * fire within `guardMs` of menu open are treated as accidental and
 * suppressed.
 */
export interface SelectGuard {
	guard: (action: () => void) => () => void;
}

export interface CreateSelectGuardOptions {
	guardMs?: number;
	now?: () => number;
}

export function createSelectGuard(
	options: CreateSelectGuardOptions = {},
): SelectGuard {
	const guardMs = options.guardMs ?? 300;
	const now = options.now ?? (() => performance.now());
	const openedAt = now();

	return {
		guard(action) {
			return () => {
				if (now() - openedAt < guardMs) return;
				action();
			};
		},
	};
}

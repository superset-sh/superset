import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkey } from "renderer/hotkeys";
import { usePaneFocusIntent } from "renderer/stores/pane-focus-intent";
import { usePaneMruStore } from "renderer/stores/pane-mru";
import { navigateToV2Workspace } from "../../utils/workspace-navigation";
import {
	advanceCycle,
	isCycleModifier,
	type MruCycle,
	selectedEntry,
} from "./cycle";

/**
 * Drives the Ctrl+Tab most-recently-used pane switcher.
 *
 * Hold Ctrl and tap Tab to walk backwards through recently used panes
 * (Ctrl+Shift+Tab walks forward); release Ctrl to jump to the highlighted one.
 * A single tap-and-release toggles between the two most recent panes.
 *
 * Lives at the dashboard level so it works regardless of which workspace is
 * open, and so it can switch to a pane in a different workspace.
 */
export function usePaneMruSwitcher(): { cycle: MruCycle | null } {
	const [cycle, setCycle] = useState<MruCycle | null>(null);
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const requestPaneFocus = usePaneFocusIntent((state) => state.request);

	const workspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
		fuzzy: true,
	});
	const currentWorkspaceId =
		workspaceMatch !== false ? workspaceMatch.workspaceId : null;

	// The ref, not the React state, is the source of truth for the cycle.
	// Key events arrive faster than React can re-render: on a quick tap the Tab
	// keydown and the Ctrl keyup can both land before the state update commits,
	// so a handler reading render-assigned state would see no cycle and skip
	// the switch. The ref is written synchronously in `step`; the state exists
	// only so the overlay re-renders.
	const cycleRef = useRef<MruCycle | null>(null);
	const currentWorkspaceIdRef = useRef(currentWorkspaceId);
	currentWorkspaceIdRef.current = currentWorkspaceId;

	const step = useCallback((direction: "forward" | "backward") => {
		const next = advanceCycle({
			cycle: cycleRef.current,
			entries: usePaneMruStore.getState().entries,
			direction,
		});
		cycleRef.current = next;
		setCycle(next);
	}, []);

	useHotkey("NEXT_TAB_ALT", () => step("backward"));
	useHotkey("PREV_TAB_ALT", () => step("forward"));
	// Ctrl+` reverses direction without needing Shift, so you can overshoot
	// with Ctrl+Tab and walk back without releasing Ctrl.
	useHotkey("MRU_STEP_FORWARD", () => step("forward"));

	const commit = useCallback(() => {
		const active = cycleRef.current;
		cycleRef.current = null;
		setCycle(null);
		if (!active) return;

		const entry = selectedEntry(active);
		if (!entry) return;

		// Always go through the intent store, even for the current workspace:
		// the mounted workspace's pane store is not reachable from here, and
		// one activation path is easier to reason about than two.
		requestPaneFocus({
			workspaceId: entry.workspaceId,
			tabId: entry.tabId,
			paneId: entry.paneId,
		});

		if (entry.workspaceId !== currentWorkspaceIdRef.current) {
			void navigateToV2Workspace(entry.workspaceId, navigate);
		}
	}, [navigate, requestPaneFocus]);

	const cancel = useCallback(() => {
		cycleRef.current = null;
		setCycle(null);
	}, []);

	// These listeners are registered unconditionally and check for an active
	// cycle at call time. Registering them only while a cycle exists loses the
	// race on a quick tap: the Tab keydown sets React state, but Ctrl can be
	// released before the resulting effect has attached the keyup handler — so
	// the commit never fires and the switch silently does nothing.
	useEffect(() => {
		const onKeyUp = (event: KeyboardEvent) => {
			if (!cycleRef.current) return;
			if (isCycleModifier(event.key)) commit();
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || !cycleRef.current) return;
			// Stop here rather than letting Escape also close a dialog or the
			// command palette underneath the overlay.
			event.preventDefault();
			event.stopPropagation();
			cancel();
		};
		// Losing the window mid-cycle CANCELS. In Electron `blur` also fires when
		// focus moves into a webview or DevTools, so committing here would turn
		// an incidental focus change into a real pane switch — and possibly a
		// cross-workspace navigation the user never asked for.
		const onBlur = () => {
			if (cycleRef.current) cancel();
		};

		window.addEventListener("keyup", onKeyUp);
		window.addEventListener("keydown", onKeyDown, true);
		window.addEventListener("blur", onBlur);
		return () => {
			window.removeEventListener("keyup", onKeyUp);
			window.removeEventListener("keydown", onKeyDown, true);
			window.removeEventListener("blur", onBlur);
		};
	}, [commit, cancel]);

	return { cycle };
}

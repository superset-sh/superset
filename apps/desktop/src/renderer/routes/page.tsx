import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";

interface RootSearchParams {
	/** Set by the main process when a window is opened for a specific workspace. */
	workspaceId?: string;
	/** Tab to activate on first paint ("Open Tab in New Window"). */
	focusTabId?: string;
}

// Apply at most once per window: the param describes the window's initial
// state, not a persistent binding.
let focusTabApplied = false;

function applyFocusTab(workspaceId: string, focusTabId: string): void {
	if (focusTabApplied) return;
	focusTabApplied = true;

	const apply = () => {
		const { tabs, setActiveTab } = useTabsStore.getState();
		const tabExists = tabs.some(
			(tab) => tab.id === focusTabId && tab.workspaceId === workspaceId,
		);
		if (tabExists) {
			setActiveTab(workspaceId, focusTabId);
		}
	};

	// Selection set before hydration would be overwritten by the hydrate merge.
	if (useTabsStore.persist.hasHydrated()) {
		apply();
	} else {
		useTabsStore.persist.onFinishHydration(apply);
	}
}

export const Route = createFileRoute("/")({
	validateSearch: (search: Record<string, unknown>): RootSearchParams => ({
		workspaceId:
			typeof search.workspaceId === "string" ? search.workspaceId : undefined,
		focusTabId:
			typeof search.focusTabId === "string" ? search.focusTabId : undefined,
	}),
	component: RootIndexPage,
});

function RootIndexPage() {
	const { workspaceId, focusTabId } = Route.useSearch();

	// Effect, not render-phase: setActiveTab mutates the store, and React
	// forbids store updates while rendering another component.
	useEffect(() => {
		if (workspaceId && focusTabId) {
			applyFocusTab(workspaceId, focusTabId);
		}
	}, [workspaceId, focusTabId]);

	// Window opened for a specific workspace (multi-window): go straight there.
	// Deliberately skips the lastViewedWorkspaceId localStorage write so a
	// secondary window doesn't hijack what the primary window restores.
	if (workspaceId) {
		return (
			<Navigate to="/workspace/$workspaceId" params={{ workspaceId }} replace />
		);
	}

	return <Navigate to="/workspace" replace />;
}

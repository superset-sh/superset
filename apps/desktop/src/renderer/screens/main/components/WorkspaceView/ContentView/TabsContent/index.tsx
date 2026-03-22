import type { ExternalApp } from "@superset/local-db";
import { useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import { resolveActiveTabIdForWorkspace } from "renderer/stores/tabs/utils";
import { EmptyTabView } from "./EmptyTabView";
import { TabView } from "./TabView";

interface TabsContentProps {
	defaultExternalApp?: ExternalApp | null;
	onOpenInApp: () => void;
	onOpenQuickOpen: () => void;
}

export function TabsContent({
	defaultExternalApp,
	onOpenInApp,
	onOpenQuickOpen,
}: TabsContentProps) {
	const { workspaceId: activeWorkspaceId } = useParams({ strict: false });
	const allTabs = useTabsStore((s) => s.tabs);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);

	// Derive which tab IDs contain webview-based panes (webview or devtools).
	// Uses a custom equality function so the component only re-renders when
	// the set of keepalive tab IDs actually changes, not on every pane mutation.
	const keepAliveTabIds = useTabsStore(
		(s) => {
			const ids = new Set<string>();
			for (const pane of Object.values(s.panes)) {
				if (pane.type === "webview" || pane.type === "devtools") {
					ids.add(pane.tabId);
				}
			}
			return ids;
		},
		(a, b) => a.size === b.size && [...a].every((id) => b.has(id)),
	);
	const tabHistoryStacks = useTabsStore((s) => s.tabHistoryStacks);
	const contentRef = useRef<HTMLDivElement>(null);
	const hasMountedRef = useRef(false);
	const previousActivationRef = useRef<{
		workspaceId: string | null;
		tabId: string | null;
	}>({
		workspaceId: null,
		tabId: null,
	});

	const activeTabId = useMemo(() => {
		if (!activeWorkspaceId) return null;

		const resolvedActiveTabId = resolveActiveTabIdForWorkspace({
			workspaceId: activeWorkspaceId,
			tabs: allTabs,
			activeTabIds,
			tabHistoryStacks,
		});
		if (!resolvedActiveTabId) return null;

		const tab = allTabs.find((t) => t.id === resolvedActiveTabId) || null;
		if (!tab || tab.workspaceId !== activeWorkspaceId) return null;
		return resolvedActiveTabId;
	}, [activeWorkspaceId, activeTabIds, allTabs, tabHistoryStacks]);

	// Keep inactive tabs mounted when they contain a webview-based pane.
	// Reparenting an Electron <webview> reloads the guest page, so both
	// browser ("webview") and devtools panes must stay in the DOM.
	const workspaceTabs = useMemo(
		() =>
			allTabs.filter((tab) => {
				if (tab.workspaceId !== activeWorkspaceId) return false;
				if (tab.id === activeTabId) return true;
				return keepAliveTabIds.has(tab.id);
			}),
		[activeTabId, keepAliveTabIds, allTabs, activeWorkspaceId],
	);

	useEffect(() => {
		const nextWorkspaceId = activeWorkspaceId ?? null;
		const nextTabId = activeTabId ?? null;
		if (!hasMountedRef.current) {
			hasMountedRef.current = true;
			previousActivationRef.current = {
				workspaceId: nextWorkspaceId,
				tabId: nextTabId,
			};
			return;
		}

		const previousActivation = previousActivationRef.current;
		const didActivationChange =
			previousActivation.workspaceId !== nextWorkspaceId ||
			previousActivation.tabId !== nextTabId;
		previousActivationRef.current = {
			workspaceId: nextWorkspaceId,
			tabId: nextTabId,
		};

		if (!didActivationChange || !nextTabId) {
			return;
		}

		const frameId = requestAnimationFrame(() => {
			// Scope to the active tab's container (the only div with display:flex)
			// to avoid matching elements in hidden but still-mounted tabs.
			const activeContainer = contentRef.current?.querySelector<HTMLDivElement>(
				`[data-tab-id="${nextTabId}"]`,
			);
			const textarea = activeContainer?.querySelector<HTMLTextAreaElement>(
				".mosaic-window-focused [data-slot=input-group-control]",
			);
			textarea?.focus();
		});

		return () => cancelAnimationFrame(frameId);
	}, [activeTabId, activeWorkspaceId]);

	const hasActiveTab = workspaceTabs.some((t) => t.id === activeTabId);

	return (
		<div ref={contentRef} className="flex-1 min-h-0 flex overflow-hidden">
			{workspaceTabs.map((tab) => (
				<div
					key={tab.id}
					data-tab-id={tab.id}
					className="flex-1 min-h-0 overflow-hidden"
					style={{
						display: tab.id === activeTabId ? "flex" : "none",
					}}
				>
					<TabView tab={tab} isActive={tab.id === activeTabId} />
				</div>
			))}
			{!hasActiveTab && (
				<EmptyTabView
					defaultExternalApp={defaultExternalApp}
					onOpenInApp={onOpenInApp}
					onOpenQuickOpen={onOpenQuickOpen}
				/>
			)}
		</div>
	);
}

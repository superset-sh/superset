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

	const tabToRender = useMemo(() => {
		if (!activeTabId) return null;
		return allTabs.find((tab) => tab.id === activeTabId) || null;
	}, [activeTabId, allTabs]);

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
			const textarea = contentRef.current?.querySelector<HTMLTextAreaElement>(
				".mosaic-window-focused [data-slot=input-group-control]",
			);
			textarea?.focus();
		});

		return () => cancelAnimationFrame(frameId);
	}, [activeTabId, activeWorkspaceId]);

	return (
		<div ref={contentRef} className="flex-1 min-h-0 flex overflow-hidden">
			{tabToRender ? (
				<TabView tab={tabToRender} />
			) : (
				<EmptyTabView
					defaultExternalApp={defaultExternalApp}
					onOpenInApp={onOpenInApp}
					onOpenQuickOpen={onOpenQuickOpen}
				/>
			)}
		</div>
	);
}

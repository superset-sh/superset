import type { ExternalApp } from "@superset/local-db";
import { cn } from "@superset/ui/utils";
import { useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import { resolveActiveTabIdForWorkspace } from "renderer/stores/tabs/utils";
import { syncAllPositions } from "renderer/stores/webview-overlay";
import { EmptyTabView } from "./EmptyTabView";
import { TabView } from "./TabView";
import { getTabsToRender } from "./utils/getTabsToRender";

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
	const panes = useTabsStore((s) => s.panes);
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

	const tabsToRender = useMemo(
		() =>
			getTabsToRender({
				activeTabId,
				tabs: allTabs,
				panes,
			}),
		[activeTabId, allTabs, panes],
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

		if (!didActivationChange) {
			return;
		}

		syncAllPositions();

		if (!nextTabId) {
			return;
		}

		const frameId = requestAnimationFrame(() => {
			const textarea = contentRef.current?.querySelector<HTMLTextAreaElement>(
				'[data-active-tab-content="true"] .mosaic-window-focused [data-slot="input-group-control"]',
			);
			textarea?.focus();
		});

		return () => cancelAnimationFrame(frameId);
	}, [activeTabId, activeWorkspaceId]);

	return (
		<div
			ref={contentRef}
			className="relative flex flex-1 min-h-0 overflow-hidden"
		>
			{tabsToRender.map((tab) => {
				const isActive = tab.id === activeTabId;

				return (
					<div
						key={tab.id}
						data-active-tab-content={isActive ? "true" : undefined}
						aria-hidden={!isActive}
						className={cn(
							"absolute inset-0 min-h-0",
							isActive ? "visible z-10" : "invisible pointer-events-none",
						)}
					>
						<TabView tab={tab} />
					</div>
				);
			})}
			{activeTabId === null ? (
				<div className="absolute inset-0 z-10 flex min-h-0 overflow-hidden">
					<EmptyTabView
						defaultExternalApp={defaultExternalApp}
						onOpenInApp={onOpenInApp}
						onOpenQuickOpen={onOpenQuickOpen}
					/>
				</div>
			) : null}
		</div>
	);
}

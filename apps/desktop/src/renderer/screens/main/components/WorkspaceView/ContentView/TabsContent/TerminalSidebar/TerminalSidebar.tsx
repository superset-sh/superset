import { Button } from "@superset/ui/button";
import { ScrollArea } from "@superset/ui/scroll-area";
import { cn } from "@superset/ui/utils";
import { useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { LuPlus } from "react-icons/lu";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Pane } from "renderer/stores/tabs/types";
import { resolveActiveTabIdForWorkspace } from "renderer/stores/tabs/utils";
import { pickHigherStatus } from "shared/tabs-types";
import { TerminalSidebarItem } from "./components/TerminalSidebarItem";

interface TerminalSidebarProps {
	className?: string;
	embedded?: boolean;
}

export function TerminalSidebar({
	className,
	embedded = false,
}: TerminalSidebarProps = {}) {
	const { workspaceId: activeWorkspaceId } = useParams({ strict: false });
	const tabs = useTabsStore((state) => state.tabs);
	const panes = useTabsStore((state) => state.panes);
	const activeTabIds = useTabsStore((state) => state.activeTabIds);
	const tabHistoryStacks = useTabsStore((state) => state.tabHistoryStacks);
	const focusedPaneIds = useTabsStore((state) => state.focusedPaneIds);
	const addTab = useTabsStore((state) => state.addTab);
	const renameTab = useTabsStore((state) => state.renameTab);
	const removeTab = useTabsStore((state) => state.removeTab);
	const setActiveTab = useTabsStore((state) => state.setActiveTab);

	const workspaceTabs = useMemo(
		() =>
			activeWorkspaceId
				? tabs.filter((tab) => tab.workspaceId === activeWorkspaceId)
				: [],
		[activeWorkspaceId, tabs],
	);

	const activeTabId = useMemo(() => {
		if (!activeWorkspaceId) return null;
		return resolveActiveTabIdForWorkspace({
			workspaceId: activeWorkspaceId,
			tabs,
			activeTabIds,
			tabHistoryStacks,
		});
	}, [activeWorkspaceId, tabs, activeTabIds, tabHistoryStacks]);

	const tabStatusMap = useMemo(() => {
		const result = new Map<string, ReturnType<typeof pickHigherStatus>>();
		for (const pane of Object.values(panes)) {
			if (!pane.status || pane.status === "idle") continue;
			result.set(pane.tabId, pickHigherStatus(result.get(pane.tabId), pane.status));
		}
		return result;
	}, [panes]);

	const panesByTabId = useMemo(() => {
		const result = new Map<string, Pane[]>();
		for (const pane of Object.values(panes)) {
			const existing = result.get(pane.tabId);
			if (existing) {
				existing.push(pane);
			} else {
				result.set(pane.tabId, [pane]);
			}
		}
		return result;
	}, [panes]);

	if (!activeWorkspaceId || workspaceTabs.length === 0) {
		return null;
	}

	return (
		<aside
			className={cn(
				"flex h-full min-h-0 flex-col bg-background/80",
				embedded ? "w-full" : "w-72 shrink-0 border-r",
				className,
			)}
		>
			<div className="flex items-center justify-between gap-2 border-b px-3 py-2">
				<div className="min-w-0">
					<div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
						Sessions
					</div>
					<div className="text-sm text-muted-foreground">
						{workspaceTabs.length} open
					</div>
				</div>
				<div className="flex items-center gap-1">
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="gap-1.5"
						onClick={() => addTab(activeWorkspaceId)}
					>
						<LuPlus className="size-4" />
						New
					</Button>
				</div>
			</div>
			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-1 p-2">
					{workspaceTabs.map((tab) => (
						<TerminalSidebarItem
							key={tab.id}
							tab={tab}
							panes={panesByTabId.get(tab.id) ?? []}
							activePaneId={focusedPaneIds[tab.id]}
							isActive={tab.id === activeTabId}
							status={tabStatusMap.get(tab.id) ?? null}
							onSelect={() => setActiveTab(activeWorkspaceId, tab.id)}
							onRename={(name) => renameTab(tab.id, name)}
							onClose={() => removeTab(tab.id)}
						/>
					))}
				</div>
			</ScrollArea>
		</aside>
	);
}

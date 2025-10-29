import { useEffect, useState } from "react";
import type { Tab, TabGroup } from "shared/runtime-types";
import TabContent from "./TabContent";

interface ScreenLayoutProps {
    tabGroup: TabGroup;
    workingDirectory: string;
    workspaceId?: string;
    worktreeId?: string;
    selectedTabId?: string;
    onTabFocus: (tabId: string) => void;
}

interface TabInstanceProps {
    tab: Tab;
    workingDirectory: string;
    workspaceId?: string;
    worktreeId?: string;
    tabGroupId: string;
    onTabFocus: (tabId: string) => void;
}

/**
 * TabInstance - Wrapper for individual tabs in the grid layout
 * Handles position-based resize triggers and delegates rendering to TabContent
 */
function TabInstance({
    tab,
    workingDirectory,
    workspaceId,
    worktreeId,
    tabGroupId,
    onTabFocus,
}: TabInstanceProps) {
    // Trigger fit when position changes (for terminal resizing)
    const [fitTrigger, setFitTrigger] = useState(0);

    // Trigger fit when tab position changes (row or col)
    useEffect(() => {
        setFitTrigger((prev) => prev + 1);
    }, [tab.row, tab.col]);

    return (
        <TabContent
            tab={tab}
            workingDirectory={workingDirectory}
            workspaceId={workspaceId}
            worktreeId={worktreeId}
            tabGroupId={tabGroupId}
            onTabFocus={onTabFocus}
            triggerFit={fitTrigger}
        />
    );
}

export default function ScreenLayout({
    tabGroup,
    workingDirectory,
    workspaceId,
    worktreeId,
    selectedTabId,
    onTabFocus,
}: ScreenLayoutProps) {
    // Safety check: ensure tabGroup has tabs
    if (!tabGroup || !tabGroup.tabs || !Array.isArray(tabGroup.tabs)) {
        return (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                    <p>Invalid tab group structure</p>
                    <p className="text-sm text-gray-500 mt-2">
                        Please rescan worktrees or create a new tab group
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div
            className="w-full h-full gap-1 p-1"
            style={{
                display: "grid",
                gridTemplateRows: `repeat(${tabGroup.rows}, 1fr)`,
                gridTemplateColumns: `repeat(${tabGroup.cols}, 1fr)`,
            }}
        >
            {tabGroup.tabs.map((tab) => {
                const isActive = selectedTabId === tab.id;
                return (
                    <div
                        key={tab.id}
                        className={`overflow-hidden rounded border ${isActive
                                ? "border-blue-500 ring-2 ring-blue-500/50"
                                : "border-neutral-800"
                            }`}
                        style={{
                            gridRow: `${tab.row + 1} / span ${tab.rowSpan || 1}`,
                            gridColumn: `${tab.col + 1} / span ${tab.colSpan || 1}`,
                        }}
                    >
                        <TabInstance
                            tab={tab}
                            workingDirectory={workingDirectory}
                            workspaceId={workspaceId}
                            worktreeId={worktreeId}
                            tabGroupId={tabGroup.id}
                            onTabFocus={onTabFocus}
                        />
                    </div>
                );
            })}
        </div>
    );
}

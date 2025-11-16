import { useEffect, useRef, useState } from "react";
import type { Tab } from "shared/types";
import { useTabContext, useWorkspaceContext } from "../../../../contexts";
import { PortTab } from "../TabContent/components/PortTab";
import { PreviewTab } from "../TabContent/components/PreviewTab";
import TabGroup from "./TabGroup";
import Terminal from "./Terminal";

interface TabContentProps {
	tab: Tab;
	groupTabId: string; // ID of the parent group tab
	isVisibleInMosaic?: boolean; // Whether this tab is visible in a mosaic layout
}

/**
 * TabContent - Abstraction layer that renders different content types based on tab.type
 *
 * This component acts as a router for different tab types:
 * - "terminal": Renders a terminal instance
 * - "editor": (Future) Code editor
 * - "browser": (Future) Embedded browser
 * - "preview": (Future) Preview pane
 */
export default function TabContent({
	tab,
	groupTabId,
	isVisibleInMosaic = false,
}: TabContentProps) {
	const { currentWorkspace } = useWorkspaceContext();
	const { selectedWorktreeId, selectedTabId, handleTabFocus } = useTabContext();

	const selectedWorktree = currentWorkspace?.worktrees?.find(
		(wt) => wt.id === selectedWorktreeId,
	);

	const workingDirectory =
		selectedWorktree?.path || currentWorkspace?.repoPath || "";
	const workspaceId = currentWorkspace?.id || "";
	const worktreeId = selectedWorktreeId ?? undefined;
	const worktree = selectedWorktree;

	const handleFocus = () => {
		handleTabFocus(tab.id);
	};

	// Render based on tab type
	switch (tab.type) {
		case "group":
			// Recursively render a nested ScreenLayout for group tabs
			return <TabGroup groupTab={tab} />;

		case "terminal":
			return (
				<TerminalTabContent
					tab={tab}
					workingDirectory={workingDirectory}
					workspaceId={workspaceId}
					worktreeId={worktreeId}
					groupTabId={groupTabId}
					selectedTabId={selectedTabId}
					onFocus={handleFocus}
					isVisibleInMosaic={isVisibleInMosaic}
				/>
			);

		case "port":
			if (!worktree) {
				return (
					<PlaceholderContent
						type="port"
						message="Worktree data not available"
						onFocus={handleFocus}
					/>
				);
			}
			return (
				<div className="w-full h-full" onClick={handleFocus}>
					<PortTab tab={tab} worktree={worktree} workspaceId={workspaceId} />
				</div>
			);

		case "editor":
			return (
				<PlaceholderContent
					type="editor"
					message="Code editor coming soon"
					onFocus={handleFocus}
				/>
			);

		case "browser":
			return (
				<PlaceholderContent
					type="browser"
					message="Embedded browser coming soon"
					onFocus={handleFocus}
				/>
			);

		case "preview":
			return (
				<div className="w-full h-full" onClick={handleFocus}>
					<PreviewTab
						tab={tab}
						workspaceId={workspaceId}
						worktreeId={worktreeId}
						worktree={worktree}
					/>
				</div>
			);

		default:
			return (
				<PlaceholderContent
					type="unknown"
					message={`Unknown tab type: ${tab.type}`}
					onFocus={handleFocus}
				/>
			);
	}
}

/**
 * TerminalTabContent - Handles terminal-specific display logic
 */
interface TerminalTabContentProps {
	tab: Tab;
	workingDirectory: string;
	workspaceId?: string;
	worktreeId?: string;
	groupTabId: string; // ID of the parent group tab
	selectedTabId?: string; // Currently selected tab ID
	onFocus: () => void;
	isVisibleInMosaic?: boolean; // Whether this tab is visible in a mosaic layout
}

function TerminalTabContent({
	tab,
	workingDirectory,
	workspaceId,
	worktreeId,
	groupTabId,
	selectedTabId,
	onFocus,
	isVisibleInMosaic = false,
}: TerminalTabContentProps) {
	const terminalId = tab.id;
	const isSelected = selectedTabId === tab.id;
	// Terminal should be visible if it's selected OR visible in a mosaic layout
	const isVisible = isSelected || isVisibleInMosaic;

	// Listen for CWD changes from the main process
	useEffect(() => {
		if (!terminalId || !workspaceId || !worktreeId) return;

		const handleCwdChange = async (data: { id: string; cwd: string }) => {
			// Only handle changes for this terminal
			if (data.id !== terminalId) return;

			// Save the new CWD to the workspace config
			try {
				await window.ipcRenderer.invoke("workspace-update-terminal-cwd", {
					workspaceId,
					worktreeId,
					tabId: tab.id,
					cwd: data.cwd,
				});
			} catch (error) {
				console.error("Failed to save terminal CWD:", error);
			}
		};

		window.ipcRenderer.on("terminal-cwd-changed", handleCwdChange);

		return () => {
			window.ipcRenderer.off("terminal-cwd-changed", handleCwdChange);
		};
	}, [terminalId, tab.id, workspaceId, worktreeId]);

	// Use saved CWD if available, otherwise use workingDirectory
	const terminalCwd = tab.cwd || workingDirectory;

	return (
		<div className="w-full h-full">
			<Terminal
				key={terminalId}
				terminalId={terminalId}
				hidden={!isVisible}
				onFocus={onFocus}
				cwd={terminalCwd}
			/>
		</div>
	);
}

/**
 * PlaceholderContent - Displays placeholder for unimplemented tab types
 */
interface PlaceholderContentProps {
	type: string;
	message: string;
	onFocus: () => void;
}

function PlaceholderContent({
	type,
	message,
	onFocus,
}: PlaceholderContentProps) {
	return (
		<div
			className="w-full h-full flex items-center justify-center bg-neutral-950"
			onClick={onFocus}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					onFocus();
				}
			}}
		>
			<div className="text-center text-neutral-400">
				<div className="text-lg font-semibold mb-2 capitalize">{type}</div>
				<div className="text-sm">{message}</div>
			</div>
		</div>
	);
}

import { useEffect, useRef, useState } from "react";
import type { Tab, Worktree } from "shared/types";
import { PortTab } from "../TabContent/components/PortTab";
import { PreviewTab } from "../TabContent/components/PreviewTab";
import TabGroup from "./TabGroup";
import Terminal from "./Terminal";

interface TabContentProps {
	tab: Tab;
	workingDirectory: string;
	workspaceId: string;
	worktreeId: string | undefined;
	worktree?: Worktree;
	groupTabId: string; // ID of the parent group tab
	selectedTabId?: string; // Currently selected tab ID
	onTabFocus: (tabId: string) => void;
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
	workingDirectory,
	workspaceId,
	worktreeId,
	worktree,
	groupTabId,
	selectedTabId,
	onTabFocus,
}: TabContentProps) {
	const handleFocus = () => {
		onTabFocus(tab.id);
	};

	// Render based on tab type
	switch (tab.type) {
		case "group":
			// Recursively render a nested ScreenLayout for group tabs
			return (
				<TabGroup
					groupTab={tab}
					workingDirectory={workingDirectory}
					workspaceId={workspaceId}
					worktreeId={worktreeId}
					selectedTabId={selectedTabId}
					onTabFocus={onTabFocus}
				/>
			);

		case "terminal":
			return (
				<TerminalTabContent
					tab={tab}
					workingDirectory={workingDirectory}
					workspaceId={workspaceId}
					worktreeId={worktreeId}
					groupTabId={groupTabId}
					onFocus={handleFocus}
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
	onFocus: () => void;
}

function TerminalTabContent({
	tab,
	workingDirectory,
	workspaceId,
	worktreeId,
	groupTabId,
	onFocus,
}: TerminalTabContentProps) {
	const terminalId = tab.id;
	const terminalCreatedRef = useRef(false);

	// Terminal creation and lifecycle
	useEffect(() => {
		// Prevent double creation - only create once per tab.id
		if (terminalCreatedRef.current) {
			return;
		}

		terminalCreatedRef.current = true;

		const createTerminal = async () => {
			try {
				// Use saved CWD if available, otherwise use workingDirectory
				const initialCwd = tab.cwd || workingDirectory;

				if (!initialCwd) {
					console.error(
						"[TabContent] No CWD available for terminal tab",
						tab.id,
					);
					return;
				}

				// Pass the stable tab.id as the terminal ID
				// If terminal already exists in backend, it will reuse it
				await window.ipcRenderer.invoke("terminal-create", {
					id: tab.id,
					cwd: initialCwd,
				});

				// Execute startup command if specified
				if (tab.command && tab.command.trim() !== "") {
					const commandToExecute = tab.command;
					setTimeout(() => {
						window.ipcRenderer.invoke("terminal-execute-command", {
							id: tab.id,
							command: commandToExecute,
						});
					}, 500); // Small delay to ensure terminal is ready
				}
			} catch (error) {
				console.error("Failed to create terminal:", error);
			}
		};

		createTerminal();

		// No cleanup - terminals persist in backend
		// They're only killed when explicitly removed from config
		// This prevents terminals from being killed during reordering
	}, [tab.id]);

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

	return (
		<div className="w-full h-full">
			<Terminal key={terminalId} terminalId={terminalId} onFocus={onFocus} />
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

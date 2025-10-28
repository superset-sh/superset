import { useEffect, useRef, useState } from "react";
import type { Tab, TabGroup } from "shared/types";
import Terminal from "./Terminal";

interface TerminalLayoutProps {
	tabGroup: TabGroup;
	workingDirectory: string;
	workspaceId?: string;
	worktreeId?: string;
}

interface TerminalInstanceProps {
	tab: Tab;
	workingDirectory: string;
	workspaceId?: string;
	worktreeId?: string;
	tabGroupId: string;
}

function TerminalInstance({
	tab,
	workingDirectory,
	workspaceId,
	worktreeId,
	tabGroupId,
}: TerminalInstanceProps) {
	const [terminalId, setTerminalId] = useState<string | null>(null);
	const terminalCreatedRef = useRef(false);

	useEffect(() => {
		// Prevent double creation - only create once per tab.id
		if (terminalCreatedRef.current) {
			return;
		}

		// Create terminal instance
		const createTerminal = async () => {
			try {
				// Use saved CWD if available, otherwise use workingDirectory
				// Ensure we always have a valid directory
				const initialCwd = tab.cwd || workingDirectory;

				if (!initialCwd) {
					console.error(
						"[TerminalLayout] No CWD available for tab",
						tab.id,
					);
					return;
				}

				terminalCreatedRef.current = true;

				const id = (await window.ipcRenderer.invoke("terminal-create", {
					cwd: initialCwd,
				})) as string;
				setTerminalId(id);

				// Execute startup command if specified
				if (tab.command && id) {
					setTimeout(() => {
						window.ipcRenderer.invoke("terminal-execute-command", {
							id,
							command: tab.command,
						});
					}, 500); // Small delay to ensure terminal is ready
				}
			} catch (error) {
				console.error("Failed to create terminal:", error);
			}
		};

		createTerminal();

		// Cleanup
		return () => {
			if (terminalId) {
				window.ipcRenderer.invoke("terminal-kill", terminalId);
			}
		};
	}, [workingDirectory, tab.command, tab.cwd, tab.id]);

	// Listen for CWD changes from the main process
	useEffect(() => {
		if (!terminalId || !workspaceId || !worktreeId || !tabGroupId) return;

		const handleCwdChange = async (data: { id: string; cwd: string }) => {
			// Only handle changes for this terminal
			if (data.id !== terminalId) return;

			// Save the new CWD to the workspace config (tab IS the terminal)
			try {
				await window.ipcRenderer.invoke("workspace-update-terminal-cwd", {
					workspaceId,
					worktreeId,
					tabGroupId,
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
	}, [terminalId, tab.id, workspaceId, worktreeId, tabGroupId]);

	return (
		<div className="w-full h-full">
			<Terminal terminalId={terminalId} />
		</div>
	);
}

export default function TerminalLayout({
	tabGroup,
	workingDirectory,
	workspaceId,
	worktreeId,
}: TerminalLayoutProps) {
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
			{tabGroup.tabs.map((tab) => (
				<div
					key={tab.id}
					className="overflow-hidden rounded border border-neutral-800"
					style={{
						gridRow: `${tab.row + 1} / span ${tab.rowSpan || 1}`,
						gridColumn: `${tab.col + 1} / span ${tab.colSpan || 1}`,
					}}
				>
					<TerminalInstance
						tab={tab}
						workingDirectory={workingDirectory}
						workspaceId={workspaceId}
						worktreeId={worktreeId}
						tabGroupId={tabGroup.id}
					/>
				</div>
			))}
		</div>
	);
}

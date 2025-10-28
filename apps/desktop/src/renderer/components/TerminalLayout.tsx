import { useEffect, useRef, useState } from "react";
import type { GridLayout, GridTerminal } from "shared/types";
import Terminal from "./Terminal";

interface TerminalLayoutProps {
	layout: GridLayout;
	workingDirectory: string;
	workspaceId?: string;
	worktreeId?: string;
	tabGroupId?: string;
	tabId?: string;
}

interface TerminalInstanceProps {
	terminal: GridTerminal;
	workingDirectory: string;
	workspaceId?: string;
	worktreeId?: string;
	tabGroupId?: string;
	tabId?: string;
}

function TerminalInstance({
	terminal,
	workingDirectory,
	workspaceId,
	worktreeId,
	tabGroupId,
	tabId,
}: TerminalInstanceProps) {
	const [terminalId, setTerminalId] = useState<string | null>(null);
	const terminalCreatedRef = useRef(false);

	useEffect(() => {
		// Prevent double creation - only create once per terminal.id
		if (terminalCreatedRef.current) {
			return;
		}

		// Create terminal instance
		const createTerminal = async () => {
			try {
				// Use saved CWD if available, otherwise use workingDirectory
				// Ensure we always have a valid directory
				const initialCwd = terminal.cwd || workingDirectory;

				if (!initialCwd) {
					console.error(
						"[TerminalLayout] No CWD available for terminal",
						terminal.id,
					);
					return;
				}

				terminalCreatedRef.current = true;

				const id = (await window.ipcRenderer.invoke("terminal-create", {
					cwd: initialCwd,
				})) as string;
				setTerminalId(id);

				// Execute startup command if specified
				if (terminal.command && id) {
					setTimeout(() => {
						window.ipcRenderer.invoke("terminal-execute-command", {
							id,
							command: terminal.command,
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
	}, [workingDirectory, terminal.command, terminal.cwd, terminal.id]);

	// Listen for CWD changes from the main process
	useEffect(() => {
		if (!terminalId || !workspaceId || !worktreeId || !tabGroupId || !tabId)
			return;

		const handleCwdChange = async (data: { id: string; cwd: string }) => {
			// Only handle changes for this terminal
			if (data.id !== terminalId) return;

			// Save the new CWD to the workspace config
			try {
				await window.ipcRenderer.invoke("workspace-update-terminal-cwd", {
					workspaceId,
					worktreeId,
					tabGroupId,
					tabId,
					terminalId: terminal.id,
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
	}, [terminalId, terminal.id, workspaceId, worktreeId, tabGroupId, tabId]);

	return (
		<div className="w-full h-full">
			<Terminal terminalId={terminalId} />
		</div>
	);
}

export default function TerminalLayout({
	layout,
	workingDirectory,
	workspaceId,
	worktreeId,
	tabGroupId,
	tabId,
}: TerminalLayoutProps) {
	// Safety check: ensure layout has the expected structure
	if (!layout || !layout.terminals || !Array.isArray(layout.terminals)) {
		return (
			<div className="w-full h-full flex items-center justify-center text-gray-400">
				<div className="text-center">
					<p>Invalid layout structure</p>
					<p className="text-sm text-gray-500 mt-2">
						Please rescan worktrees or create a new tab
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
				gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
				gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
			}}
		>
			{layout.terminals.map((terminal) => (
				<div
					key={terminal.id}
					className="overflow-hidden rounded border border-neutral-800"
					style={{
						gridRow: `${terminal.row + 1} / span ${terminal.rowSpan || 1}`,
						gridColumn: `${terminal.col + 1} / span ${terminal.colSpan || 1}`,
					}}
				>
					<TerminalInstance
						terminal={terminal}
						workingDirectory={workingDirectory}
						workspaceId={workspaceId}
						worktreeId={worktreeId}
						tabGroupId={tabGroupId}
						tabId={tabId}
					/>
				</div>
			))}
		</div>
	);
}

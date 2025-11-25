import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { trpc } from "renderer/lib/trpc";
import { createTerminalInstance, setupResizeHandlers } from "./helpers";
import type { TerminalStreamEvent } from "./types";

interface SetupCopyResults {
	copied: string[];
	errors: string[];
}

interface SetupTerminalProps {
	tabId: string;
	workspaceId: string;
	setupCommands?: string[];
	setupCopyResults?: SetupCopyResults;
	setupCwd?: string;
}

/**
 * Terminal that runs setup commands and displays output.
 * Used for setup tabs where we need to show command execution.
 */
export function SetupTerminal({
	tabId,
	workspaceId,
	setupCommands,
	setupCopyResults,
	setupCwd,
}: SetupTerminalProps) {
	const terminalRef = useRef<HTMLDivElement>(null);
	const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);

	const createOrAttachMutation = trpc.terminal.createOrAttach.useMutation();
	const writeMutation = trpc.terminal.write.useMutation();
	const resizeMutation = trpc.terminal.resize.useMutation();
	const detachMutation = trpc.terminal.detach.useMutation();

	// Stable refs for mutations to avoid recreating effect
	const createOrAttachRef = useRef(createOrAttachMutation.mutate);
	const writeRef = useRef(writeMutation.mutate);
	const resizeRef = useRef(resizeMutation.mutate);
	const detachRef = useRef(detachMutation.mutate);

	createOrAttachRef.current = createOrAttachMutation.mutate;
	writeRef.current = writeMutation.mutate;
	resizeRef.current = resizeMutation.mutate;
	detachRef.current = detachMutation.mutate;

	const handleStreamData = (event: TerminalStreamEvent) => {
		const container = terminalRef.current;
		if (!container) return;

		const xterm = (container as any)._xterm;
		if (!xterm) return;

		if (event.type === "data") {
			xterm.write(event.data);
		} else if (event.type === "exit") {
			setSubscriptionEnabled(false);
			xterm.writeln(
				`\r\n\r\n\x1b[32m✓ Setup completed! You can close this tab.\x1b[0m`,
			);
		}
	};

	trpc.terminal.stream.useSubscription(tabId, {
		onData: handleStreamData,
		enabled: subscriptionEnabled,
	});

	useEffect(() => {
		const container = terminalRef.current;
		if (!container) return;

		// Create xterm instance with same config as regular terminal
		const { xterm, fitAddon } = createTerminalInstance(container, setupCwd);
		(container as any)._xterm = xterm;

		// Display initial status
		xterm.writeln(`\x1b[36mSetting up worktree...\x1b[0m\r\n`);

		// Display copy results
		if (setupCopyResults) {
			xterm.writeln(`\x1b[36mCopying files...\x1b[0m\r\n`);
			const { copied, errors } = setupCopyResults;
			if (copied.length > 0) {
				xterm.writeln(`\x1b[32m✓ Copied ${copied.length} file(s)\x1b[0m`);
				for (const file of copied) {
					xterm.writeln(`  - ${file}`);
				}
			}
			if (errors.length > 0) {
				xterm.writeln(`\r\n\x1b[33m⚠ Copy warnings:\x1b[0m`);
				for (const error of errors) {
					xterm.writeln(`  ${error}`);
				}
			}
			xterm.writeln("");
		}

		// Display setup info
		if (setupCommands && setupCommands.length > 0) {
			xterm.writeln(`\x1b[36mRunning setup commands...\x1b[0m\r\n`);
		}

		// Create terminal session and run setup commands
		createOrAttachRef.current(
			{
				tabId,
				workspaceId,
				tabTitle: "Setup",
				cols: xterm.cols,
				rows: xterm.rows,
				cwd: setupCwd,
			},
			{
				onSuccess: () => {
					setSubscriptionEnabled(true);

					// Send all setup commands
					if (setupCommands && setupCommands.length > 0) {
						for (const cmd of setupCommands) {
							writeRef.current({ tabId, data: `${cmd}\n` });
						}

						// Send exit command to trigger completion message
						writeRef.current({ tabId, data: "exit\n" });
					}
				},
			},
		);

		// Setup resize handlers
		const cleanupResize = setupResizeHandlers(
			container,
			xterm,
			fitAddon,
			(cols, rows) => {
				resizeRef.current({ tabId, cols, rows });
			},
		);

		return () => {
			cleanupResize();
			detachRef.current({ tabId });
			setSubscriptionEnabled(false);
			xterm.dispose();
			delete (container as any)._xterm;
		};
	}, [tabId, workspaceId, setupCommands, setupCopyResults, setupCwd]);

	return (
		<div className="h-full w-full overflow-hidden bg-black">
			<div ref={terminalRef} className="h-full w-full" />
		</div>
	);
}

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { trpc } from "renderer/lib/trpc";
import {
	createTerminalInstance,
	setupResizeHandlers,
} from "../Terminal/helpers";
import type { TerminalStreamEvent } from "../Terminal/types";

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
 */
export function SetupTerminal({
	tabId,
	workspaceId,
	setupCommands,
	setupCopyResults,
	setupCwd,
}: SetupTerminalProps) {
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<ReturnType<typeof createTerminalInstance> | null>(
		null,
	);
	const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);
	const setupExecutedRef = useRef(false);

	const createMutation = trpc.terminal.createOrAttach.useMutation();
	const writeMutation = trpc.terminal.write.useMutation();
	const resizeMutation = trpc.terminal.resize.useMutation();
	const detachMutation = trpc.terminal.detach.useMutation();

	const handleStreamData = (event: TerminalStreamEvent) => {
		if (!xtermRef.current) return;
		const { xterm } = xtermRef.current;

		if (event.type === "data") {
			xterm.write(event.data);
		} else if (event.type === "exit") {
			setSubscriptionEnabled(false);
			xterm.writeln(
				"\r\n\r\n\x1b[32m✓ Setup completed! You can close this tab.\x1b[0m",
			);
		}
	};

	trpc.terminal.stream.useSubscription(tabId, {
		onData: handleStreamData,
		enabled: subscriptionEnabled,
	});

	useEffect(() => {
		const container = terminalRef.current;
		if (!container || setupExecutedRef.current) return;

		setupExecutedRef.current = true;

		// Create xterm instance
		const terminal = createTerminalInstance(container, setupCwd);
		xtermRef.current = terminal;
		const { xterm, fitAddon } = terminal;

		// Display status messages
		xterm.writeln("\x1b[36mSetting up worktree...\x1b[0m\r\n");

		if (setupCopyResults) {
			xterm.writeln("\x1b[36mCopying files...\x1b[0m\r\n");
			const { copied, errors } = setupCopyResults;

			if (copied.length > 0) {
				xterm.writeln(`\x1b[32m✓ Copied ${copied.length} file(s)\x1b[0m`);
				for (const file of copied) {
					xterm.writeln(`  - ${file}`);
				}
			}

			if (errors.length > 0) {
				xterm.writeln("\r\n\x1b[33m⚠ Copy warnings:\x1b[0m");
				for (const error of errors) {
					xterm.writeln(`  ${error}`);
				}
			}

			xterm.writeln("");
		}

		if (setupCommands && setupCommands.length > 0) {
			xterm.writeln("\x1b[36mRunning setup commands...\x1b[0m\r\n");
		}

		// Create terminal session and run commands
		createMutation.mutate(
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

					// Send commands once
					if (setupCommands && setupCommands.length > 0) {
						const combinedCommands = `${setupCommands.join(" && ")} && exit\n`;
						writeMutation.mutate({ tabId, data: combinedCommands });
					}
				},
			},
		);

		// Setup resize
		const cleanupResize = setupResizeHandlers(
			container,
			xterm,
			fitAddon,
			(cols, rows) => {
				resizeMutation.mutate({ tabId, cols, rows });
			},
		);

		return () => {
			cleanupResize();
			detachMutation.mutate({ tabId });
			setSubscriptionEnabled(false);
			xterm.dispose();
			xtermRef.current = null;
		};
	}, [
		tabId,
		workspaceId,
		setupCommands,
		setupCopyResults,
		setupCwd,
		createMutation,
		writeMutation,
		resizeMutation,
		detachMutation,
	]);

	return (
		<div className="h-full w-full overflow-hidden bg-black">
			<div ref={terminalRef} className="h-full w-full" />
		</div>
	);
}

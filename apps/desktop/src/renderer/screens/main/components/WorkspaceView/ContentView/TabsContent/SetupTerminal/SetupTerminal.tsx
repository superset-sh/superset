import "@xterm/xterm/css/xterm.css";
import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores";
import {
	createTerminalInstance,
	setupResizeHandlers,
} from "../Terminal/helpers";
import type { TerminalStreamEvent } from "../Terminal/types";

interface SetupTerminalProps {
	tabId: string;
	workspaceId: string;
	setupCommands: string[];
	setupCwd: string;
	setupCopyResults?: { copied: string[]; errors: string[] };
}

export const SetupTerminal = ({
	tabId,
	workspaceId,
	setupCommands,
	setupCwd,
	setupCopyResults,
}: SetupTerminalProps) => {
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);
	const setupExecutedRef = useRef(false);
	const hasInitializedRef = useRef(false);
	const removeTab = useTabsStore((state) => state.removeTab);

	const { data: workspaceCwd } =
		trpc.terminal.getWorkspaceCwd.useQuery(workspaceId);

	const createOrAttachMutation = trpc.terminal.createOrAttach.useMutation();
	const writeMutation = trpc.terminal.write.useMutation();
	const resizeMutation = trpc.terminal.resize.useMutation();
	const detachMutation = trpc.terminal.detach.useMutation();

	const createOrAttachRef = useRef(createOrAttachMutation.mutate);
	const writeRef = useRef(writeMutation.mutate);
	const resizeRef = useRef(resizeMutation.mutate);
	const detachRef = useRef(detachMutation.mutate);

	createOrAttachRef.current = createOrAttachMutation.mutate;
	writeRef.current = writeMutation.mutate;
	resizeRef.current = resizeMutation.mutate;
	detachRef.current = detachMutation.mutate;

	const handleStreamData = (event: TerminalStreamEvent) => {
		if (!xtermRef.current || !subscriptionEnabled) return;

		if (event.type === "data") {
			xtermRef.current.write(event.data);
		} else if (event.type === "exit") {
			xtermRef.current.writeln(`\r\n\r\n[Process exited with code ${event.exitCode}]`);

			if (event.exitCode === 0) {
				// Success - show completion message and auto-close after a brief delay
				xtermRef.current.writeln("\r\n\x1b[32m✓ Setup completed successfully!\x1b[0m");
				xtermRef.current.writeln("Closing tab...");

				setTimeout(() => {
					removeTab(tabId);
				}, 1500);
			} else {
				// Failed - don't auto-close, let user see the error
				xtermRef.current.writeln("\r\n\x1b[31m✗ Setup failed\x1b[0m");
				xtermRef.current.writeln("Please check the errors above.");
			}

			setSubscriptionEnabled(false);
		}
	};

	trpc.terminal.stream.useSubscription(tabId, {
		onData: handleStreamData,
		enabled: true,
	});

	useEffect(() => {
		const container = terminalRef.current;
		if (!container) return;

		// Use the same helper as Terminal component (this works!)
		const { xterm, fitAddon } = createTerminalInstance(container, workspaceCwd);
		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;

		// Write initial setup info
		xterm.writeln("\x1b[1m\x1b[34mSetting up worktree...\x1b[0m\r\n");

		if (setupCopyResults) {
			const { copied, errors } = setupCopyResults;
			if (copied.length > 0) {
				xterm.writeln(`\x1b[32m✓ Copied ${copied.length} file(s):\x1b[0m`);
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
			xterm.writeln("\r");
		}

		xterm.writeln("\x1b[1mRunning setup commands:\x1b[0m");
		for (const cmd of setupCommands) {
			xterm.writeln(`  $ ${cmd}`);
		}
		xterm.writeln("\r");

		// Create terminal session and execute commands
		createOrAttachRef.current(
			{
				tabId,
				workspaceId,
				tabTitle: "Setup Worktree",
				cols: xterm.cols,
				rows: xterm.rows,
				cwd: setupCwd,
			},
			{
				onSuccess: () => {
					setSubscriptionEnabled(true);

					// Execute setup commands once
					if (!setupExecutedRef.current) {
						setupExecutedRef.current = true;
						// Add 'exit' command to close shell after setup completes
						const commands = `${setupCommands.join("\n")}\nexit\n`;
						writeRef.current({ tabId, data: commands });
					}
				},
				onError: () => {
					setSubscriptionEnabled(true);
				},
			},
		);

		// Don't allow user input (read-only display)
		const inputDisposable = xterm.onData(() => {
			// Ignore input
		});

		const cleanupResize = setupResizeHandlers(
			container,
			xterm,
			fitAddon,
			(cols, rows) => {
				resizeRef.current({ tabId, cols, rows });
			},
		);

		return () => {
			inputDisposable.dispose();
			cleanupResize();
			detachRef.current({ tabId });
			setSubscriptionEnabled(false);
			xterm.dispose();
			xtermRef.current = null;
		};
	}, [
		tabId,
		workspaceId,
		setupCommands,
		setupCwd,
		setupCopyResults,
		workspaceCwd,
	]);

	return (
		<div className="h-full w-full overflow-hidden bg-black">
			<div ref={terminalRef} className="h-full w-full" />
		</div>
	);
};

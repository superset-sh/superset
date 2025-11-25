import "@xterm/xterm/css/xterm.css";
import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { trpc } from "renderer/lib/trpc";
import { useSetActiveTab, useTabsStore } from "renderer/stores";
import {
	createTerminalInstance,
	setupFocusListener,
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
	const isExitedRef = useRef(false);
	const pendingEventsRef = useRef<TerminalStreamEvent[]>([]);
	const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);
	const setActiveTab = useSetActiveTab();
	const setupExecutedRef = useRef(false);

	// Get the workspace CWD for resolving relative file paths
	const { data: workspaceCwd } =
		trpc.terminal.getWorkspaceCwd.useQuery(workspaceId);

	const createOrAttachMutation = trpc.terminal.createOrAttach.useMutation();
	const writeMutation = trpc.terminal.write.useMutation();
	const resizeMutation = trpc.terminal.resize.useMutation();
	const detachMutation = trpc.terminal.detach.useMutation();

	// Avoid effect re-runs when mutations change
	const createOrAttachRef = useRef(createOrAttachMutation.mutate);
	const writeRef = useRef(writeMutation.mutate);
	const resizeRef = useRef(resizeMutation.mutate);
	const detachRef = useRef(detachMutation.mutate);

	createOrAttachRef.current = createOrAttachMutation.mutate;
	writeRef.current = writeMutation.mutate;
	resizeRef.current = resizeMutation.mutate;
	detachRef.current = detachMutation.mutate;

	const handleStreamData = (event: TerminalStreamEvent) => {
		if (!xtermRef.current) {
			// Queue events that arrive before xterm is ready or before recovery is applied
			pendingEventsRef.current.push(event);
			return;
		}

		// Queue events while subscription is not enabled (recovery in progress)
		if (!subscriptionEnabled) {
			pendingEventsRef.current.push(event);
			return;
		}

		if (event.type === "data") {
			xtermRef.current.write(event.data);
		} else if (event.type === "exit") {
			isExitedRef.current = true;
			setSubscriptionEnabled(false);
			xtermRef.current.writeln(
				`\r\n\r\n[Process exited with code ${event.exitCode}]`,
			);
			xtermRef.current.writeln("\r\n\x1b[32m✓ Setup completed\x1b[0m");
			xtermRef.current.writeln("You can now close this tab and start working!");
		}
	};

	trpc.terminal.stream.useSubscription(tabId, {
		onData: handleStreamData,
		enabled: true, // Always listen, but queue events internally until subscriptionEnabled is true
	});

	useEffect(() => {
		const container = terminalRef.current;
		if (!container) return;

		const { xterm, fitAddon } = createTerminalInstance(container, workspaceCwd);
		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;
		isExitedRef.current = false;

		// Flush any pending events that arrived before xterm was ready or before recovery
		const flushPendingEvents = () => {
			if (pendingEventsRef.current.length === 0) return;
			const events = pendingEventsRef.current.splice(
				0,
				pendingEventsRef.current.length,
			);
			for (const event of events) {
				if (event.type === "data") {
					xterm.write(event.data);
				} else {
					isExitedRef.current = true;
					setSubscriptionEnabled(false);
					xterm.writeln(`\r\n\r\n[Process exited with code ${event.exitCode}]`);
					xterm.writeln("\r\n\x1b[32m✓ Setup completed\x1b[0m");
					xterm.writeln("You can now close this tab and start working!");
				}
			}
		};

		const applyInitialScrollback = (result: {
			wasRecovered: boolean;
			isNew: boolean;
			scrollback: string[];
		}) => {
			if (result.wasRecovered && result.scrollback.length > 0) {
				xterm.write(result.scrollback[0]);
				xterm.write("\r\n\r\n\x1b[2m[Recovered session history]\x1b[0m\r\n");
			} else if (!result.isNew && result.scrollback.length > 0) {
				xterm.write(result.scrollback[0]);
			}
		};

		const handleTerminalInput = (data: string) => {
			if (!isExitedRef.current) {
				writeRef.current({ tabId, data });
			}
		};

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
				onSuccess: (result) => {
					applyInitialScrollback(result);
					setSubscriptionEnabled(true);
					flushPendingEvents();

					// Execute setup commands if setup hasn't been executed yet
					if (!setupExecutedRef.current) {
						setupExecutedRef.current = true;

						// Print header
						xterm.writeln("\x1b[1m\x1b[34mSetting up worktree...\x1b[0m\r\n");

						// Print copy results if available
						if (setupCopyResults) {
							const { copied, errors } = setupCopyResults;
							if (copied.length > 0) {
								xterm.writeln(
									`\x1b[32m✓ Copied ${copied.length} file(s):\x1b[0m`,
								);
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
							xterm.writeln("\r");
						}

						// Print commands being run
						xterm.writeln("\x1b[1mRunning setup commands:\x1b[0m");
						for (const cmd of setupCommands) {
							xterm.writeln(`  $ ${cmd}`);
						}
						xterm.writeln("\r");

						// Send all commands sequentially
						const commands = `${setupCommands.join("\n")}\n`;
						writeRef.current({ tabId, data: commands });
					}
				},
				onError: () => {
					setSubscriptionEnabled(true);
				},
			},
		);

		const inputDisposable = xterm.onData(handleTerminalInput);
		const cleanupFocus = setupFocusListener(
			xterm,
			workspaceId,
			tabId,
			setActiveTab,
		);
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
			cleanupFocus?.();
			cleanupResize();
			// Keep PTY running for reattachment
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
		setActiveTab,
		workspaceCwd,
	]);

	return (
		<div className="h-full w-full overflow-hidden bg-black">
			<div ref={terminalRef} className="h-full w-full" />
		</div>
	);
};

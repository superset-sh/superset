import "@xterm/xterm/css/xterm.css";
import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore, useTerminalTheme } from "renderer/stores";
import {
	createTerminalInstance,
	getDefaultTerminalBg,
	setupResizeHandlers,
} from "../Terminal/helpers";
import type { TerminalStreamEvent } from "../Terminal/types";

const AUTO_CLOSE_DELAY = 1500;
const SETUP_TAB_TITLE = "Setup Worktree";

const MESSAGES = {
	SETUP_HEADER: "\x1b[1m\x1b[34mSetting up worktree...\x1b[0m\r\n",
	COMMANDS_HEADER: "\x1b[1mRunning setup commands:\x1b[0m",
	SUCCESS: "\r\n\x1b[32m✓ Setup completed successfully!\x1b[0m",
	FAILURE: "\r\n\x1b[31m✗ Setup failed\x1b[0m",
	FAILURE_HINT: "Please check the errors above.",
	CLOSING: "Closing tab...",
	FILES_COPIED: (count: number) => `\x1b[32m✓ Copied ${count} file(s):\x1b[0m`,
	COPY_WARNINGS: "\r\n\x1b[33m⚠ Copy warnings:\x1b[0m",
	TERMINAL_ERROR: "\r\n\x1b[31m✗ Failed to create terminal session\x1b[0m",
	ERROR_DETAILS: (message: string) => `\x1b[31mError: ${message}\x1b[0m`,
} as const;

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
	const setupExecutedRef = useRef(false);
	const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);

	const removeTab = useTabsStore((state) => state.removeTab);
	const terminalTheme = useTerminalTheme();
	const { data: workspaceCwd } =
		trpc.terminal.getWorkspaceCwd.useQuery(workspaceId);

	const createOrAttachMutation = trpc.terminal.createOrAttach.useMutation();
	const writeMutation = trpc.terminal.write.useMutation();
	const resizeMutation = trpc.terminal.resize.useMutation();
	const detachMutation = trpc.terminal.detach.useMutation();

	// Store mutation functions in refs to avoid infinite loops
	const createOrAttachRef = useRef(createOrAttachMutation.mutate);
	const writeRef = useRef(writeMutation.mutate);
	const resizeRef = useRef(resizeMutation.mutate);
	const detachRef = useRef(detachMutation.mutate);

	// Update refs on every render to capture latest mutation functions
	createOrAttachRef.current = createOrAttachMutation.mutate;
	writeRef.current = writeMutation.mutate;
	resizeRef.current = resizeMutation.mutate;
	detachRef.current = detachMutation.mutate;

	const handleStreamData = (event: TerminalStreamEvent) => {
		const xterm = xtermRef.current;
		if (!xterm || !subscriptionEnabled) return;

		if (event.type === "data") {
			xterm.write(event.data);
			return;
		}

		if (event.type === "exit") {
			xterm.writeln(`\r\n\r\n[Process exited with code ${event.exitCode}]`);

			if (event.exitCode === 0) {
				xterm.writeln(MESSAGES.SUCCESS);
				xterm.writeln(MESSAGES.CLOSING);
				setTimeout(() => removeTab(tabId), AUTO_CLOSE_DELAY);
			} else {
				xterm.writeln(MESSAGES.FAILURE);
				xterm.writeln(MESSAGES.FAILURE_HINT);
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

		const { xterm, fitAddon } = createTerminalInstance(
			container,
			workspaceCwd,
			terminalTheme,
		);
		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;

		// Display setup information
		xterm.writeln(MESSAGES.SETUP_HEADER);

		if (setupCopyResults) {
			const { copied, errors } = setupCopyResults;

			if (copied.length > 0) {
				xterm.writeln(MESSAGES.FILES_COPIED(copied.length));
				for (const file of copied) {
					xterm.writeln(`  - ${file}`);
				}
			}

			if (errors.length > 0) {
				xterm.writeln(MESSAGES.COPY_WARNINGS);
				for (const error of errors) {
					xterm.writeln(`  ${error}`);
				}
			}

			xterm.writeln("\r");
		}

		xterm.writeln(MESSAGES.COMMANDS_HEADER);
		for (const cmd of setupCommands) {
			xterm.writeln(`  $ ${cmd}`);
		}
		xterm.writeln("\r");

		// Create terminal session and execute setup commands
		createOrAttachRef.current(
			{
				tabId,
				workspaceId,
				tabTitle: SETUP_TAB_TITLE,
				cols: xterm.cols,
				rows: xterm.rows,
				cwd: setupCwd,
			},
			{
				onSuccess: () => {
					setSubscriptionEnabled(true);

					if (!setupExecutedRef.current) {
						setupExecutedRef.current = true;
						const commands = `${setupCommands.join("\n")}\nexit\n`;
						writeRef.current({ tabId, data: commands });
					}
				},
				onError: (error) => {
					setSubscriptionEnabled(true);

					// Display error message in terminal
					xterm.writeln(MESSAGES.TERMINAL_ERROR);

					// Include error details if available
					const errorMessage =
						error instanceof Error
							? error.message
							: typeof error === "string"
								? error
								: "Unknown error occurred";

					xterm.writeln(MESSAGES.ERROR_DETAILS(errorMessage));
					xterm.writeln(
						"\r\n\x1b[33mPlease check your workspace configuration and try again.\x1b[0m",
					);
				},
			},
		);

		// Disable user input (read-only display)
		const inputDisposable = xterm.onData(() => {});

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
		terminalTheme,
	]);

	// Update terminal theme when it changes
	useEffect(() => {
		const xterm = xtermRef.current;
		if (!xterm || !terminalTheme) return;

		// Set theme via property setter - preserves all other options
		// xterm.js v5 uses setters that trigger internal repaint
		xterm.options.theme = terminalTheme;
	}, [terminalTheme]);

	// Get terminal background color from theme, with theme-aware default
	const terminalBg = terminalTheme?.background ?? getDefaultTerminalBg();

	return (
		<div
			className="h-full w-full overflow-hidden"
			style={{ backgroundColor: terminalBg }}
		>
			<div ref={terminalRef} className="h-full w-full" />
		</div>
	);
};

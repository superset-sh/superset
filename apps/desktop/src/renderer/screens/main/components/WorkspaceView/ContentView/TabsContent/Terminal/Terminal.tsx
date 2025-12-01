import "@xterm/xterm/css/xterm.css";
import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { trpc } from "renderer/lib/trpc";
import { useSetActiveTab, useTabs, useTerminalTheme } from "renderer/stores";
import {
	createTerminalInstance,
	getDefaultTerminalBg,
	setupFocusListener,
	setupKeyboardHandler,
	setupResizeHandlers,
} from "./helpers";
import type { TerminalProps, TerminalStreamEvent } from "./types";
import { shellEscapePaths } from "./utils";

export const Terminal = ({ tabId, workspaceId }: TerminalProps) => {
	const tabs = useTabs();
	const tab = tabs.find((t) => t.id === tabId);
	const tabTitle = tab?.title || "Terminal";
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const isExitedRef = useRef(false);
	const pendingEventsRef = useRef<TerminalStreamEvent[]>([]);
	const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);
	const setActiveTab = useSetActiveTab();
	const terminalTheme = useTerminalTheme();

	// Required for resolving relative file paths in terminal commands
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
			// Prevent data loss during terminal initialization
			pendingEventsRef.current.push(event);
			return;
		}

		// Prevent race condition where events arrive before scrollback recovery completes
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
			xtermRef.current.writeln("[Press any key to restart]");
		}
	};

	trpc.terminal.stream.useSubscription(tabId, {
		onData: handleStreamData,
		// Always listen to prevent missing events during initialization
		enabled: true,
	});

	useEffect(() => {
		const container = terminalRef.current;
		if (!container) return;

		const {
			xterm,
			fitAddon,
			cleanup: cleanupQuerySuppression,
		} = createTerminalInstance(container, workspaceCwd, terminalTheme);
		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;
		isExitedRef.current = false;
		// Delay enabling subscription to ensure scrollback is applied first, preventing duplicate output

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
					xterm.writeln("[Press any key to restart]");
				}
			}
		};

		const applyInitialScrollback = (result: {
			wasRecovered: boolean;
			isNew: boolean;
			scrollback: string;
		}) => {
			xterm.write(result.scrollback);
		};

		const restartTerminal = () => {
			isExitedRef.current = false;
			setSubscriptionEnabled(false);
			xterm.clear();
			createOrAttachRef.current(
				{
					tabId,
					workspaceId,
					tabTitle,
					cols: xterm.cols,
					rows: xterm.rows,
				},
				{
					onSuccess: (result) => {
						applyInitialScrollback(result);
						setSubscriptionEnabled(true);
						flushPendingEvents();
					},
					onError: () => {
						setSubscriptionEnabled(true);
					},
				},
			);
		};

		const handleTerminalInput = (data: string) => {
			if (isExitedRef.current) {
				restartTerminal();
			} else {
				writeRef.current({ tabId, data });
			}
		};

		createOrAttachRef.current(
			{
				tabId,
				workspaceId,
				tabTitle,
				cols: xterm.cols,
				rows: xterm.rows,
			},
			{
				onSuccess: (result) => {
					applyInitialScrollback(result);
					setSubscriptionEnabled(true);
					flushPendingEvents();
				},
				onError: () => {
					setSubscriptionEnabled(true);
				},
			},
		);

		const inputDisposable = xterm.onData(handleTerminalInput);

		// Intercept keyboard events to handle app hotkeys and provide iTerm-like line continuation UX
		setupKeyboardHandler(xterm, {
			onShiftEnter: () => {
				if (!isExitedRef.current) {
					// Use shell's native continuation syntax to avoid shell-specific parsing
					writeRef.current({ tabId, data: "\\\n" });
				}
			},
		});

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
			cleanupQuerySuppression();
			// Keep PTY running for reattachment
			detachRef.current({ tabId });
			setSubscriptionEnabled(false);
			xterm.dispose();
			xtermRef.current = null;
		};
	}, [tabId, workspaceId, setActiveTab, workspaceCwd, tabTitle, terminalTheme]);

	// Sync theme changes to xterm instance for live theme switching
	useEffect(() => {
		const xterm = xtermRef.current;
		if (!xterm || !terminalTheme) return;

		xterm.options.theme = terminalTheme;
	}, [terminalTheme]);

	// Match container background to terminal theme for seamless visual integration
	const terminalBg = terminalTheme?.background ?? getDefaultTerminalBg();

	const handleDragOver = (event: React.DragEvent) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
	};

	const handleDrop = (event: React.DragEvent) => {
		event.preventDefault();

		const files = Array.from(event.dataTransfer.files);
		if (files.length === 0) return;

		// Use Electron's webUtils API to access file paths in context-isolated renderer process
		const paths = files.map((file) => window.webUtils.getPathForFile(file));
		const text = shellEscapePaths(paths);

		if (!isExitedRef.current) {
			writeRef.current({ tabId, data: text });
		}
	};

	return (
		<div
			role="application"
			className="h-full w-full overflow-hidden"
			style={{ backgroundColor: terminalBg }}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
		>
			<div ref={terminalRef} className="h-full w-full" />
		</div>
	);
};

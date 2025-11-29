import "@xterm/xterm/css/xterm.css";
import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "renderer/lib/trpc";
import {
	useSetActiveTab,
	useTabs,
	useTabsStore,
	useTerminalTheme,
} from "renderer/stores";
import {
	createTerminalInstance,
	getDefaultTerminalBg,
	setupFocusListener,
	setupResizeHandlers,
} from "./helpers";
import type { TerminalProps, TerminalStreamEvent } from "./types";

export const Terminal = ({ tabId, workspaceId }: TerminalProps) => {
	const tabs = useTabs();
	const tab = tabs.find((t) => t.id === tabId);
	const tabTitle = tab?.title || "Terminal";
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const isExitedRef = useRef(false);
	const pendingEventsRef = useRef<TerminalStreamEvent[]>([]);
	const closeTabRef = useRef<() => void>(() => {});
	const hasClosedRef = useRef(false);
	const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);
	const setActiveTab = useSetActiveTab();
	const terminalTheme = useTerminalTheme();
	const removeTab = useTabsStore((state) => state.removeTab);
	const removeChildTabFromGroup = useTabsStore(
		(state) => state.removeChildTabFromGroup,
	);

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

	useEffect(() => {
		hasClosedRef.current = false;
	}, [tabId]);

	useEffect(() => {
		closeTabRef.current = () => {
			if (hasClosedRef.current) return;
			hasClosedRef.current = true;

			if (tab?.parentId) {
				removeChildTabFromGroup(tab.parentId, tabId);
			} else {
				removeTab(tabId);
			}
		};
	}, [removeChildTabFromGroup, removeTab, tab?.parentId, tabId]);

	const handleTerminalExit = useCallback(
		(_exitCode: number) => {
			isExitedRef.current = true;
			setSubscriptionEnabled(false);
			closeTabRef.current();
		},
		[setSubscriptionEnabled],
	);

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
			handleTerminalExit(event.exitCode);
		}
	};

	trpc.terminal.stream.useSubscription(tabId, {
		onData: handleStreamData,
		enabled: true, // Always listen, but queue events internally until subscriptionEnabled is true
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
		isExitedRef.current = false;
		// Don't enable subscription yet - wait until recovery is applied

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
					handleTerminalExit(event.exitCode);
					break;
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

		const shortcutHandler = (event: KeyboardEvent) => {
			const isMetaOnly = event.metaKey && !event.ctrlKey && !event.altKey;
			if (!isMetaOnly || event.shiftKey) return true;

			if (event.code === "KeyK") {
				event.preventDefault();
				event.stopPropagation();
				xterm.clear();
				writeRef.current({ tabId, data: "\u000c" });
				return false;
			}

			if (event.code === "KeyW") {
				event.preventDefault();
				event.stopPropagation();
				closeTabRef.current();
				return false;
			}

			return true;
		};

		xterm.attachCustomKeyEventHandler(shortcutHandler);

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
		setActiveTab,
		workspaceCwd,
		tabTitle,
		handleTerminalExit,
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

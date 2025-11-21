import "@xterm/xterm/css/xterm.css";
import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { trpc } from "renderer/lib/trpc";
import { useSetActiveTab } from "renderer/stores";
import {
	createTerminalInstance,
	setupFocusListener,
	setupResizeHandlers,
} from "./helpers";
import type { TerminalProps, TerminalStreamEvent } from "./types";

export const Terminal = ({ tabId, workspaceId }: TerminalProps) => {
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const isExitedRef = useRef(false);
	const pendingEventsRef = useRef<TerminalStreamEvent[]>([]);
	const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);
	const setActiveTab = useSetActiveTab();

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
		enabled: subscriptionEnabled,
	});

	useEffect(() => {
		const container = terminalRef.current;
		if (!container) return;

		const { xterm, fitAddon } = createTerminalInstance(container);
		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;
		isExitedRef.current = false;
		setSubscriptionEnabled(true);

		// Flush any pending events that arrived before xterm was ready
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
		flushPendingEvents();

		const restartTerminal = () => {
			isExitedRef.current = false;
			setSubscriptionEnabled(false);
			xterm.clear();
			createOrAttachRef.current(
				{
					tabId,
					workspaceId,
					cols: xterm.cols,
					rows: xterm.rows,
				},
				{
					onSuccess: () => {
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
				cols: xterm.cols,
				rows: xterm.rows,
			},
			{
				onSuccess: (result) => {
					if (!result.isNew && result.scrollback.length > 0) {
						xterm.write(result.scrollback[0]);
					}
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
	}, [tabId, workspaceId, setActiveTab]);

	return (
		<div className="h-full w-full overflow-hidden bg-black">
			<div ref={terminalRef} className="h-full w-full p-2" />
		</div>
	);
};

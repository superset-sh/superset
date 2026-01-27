import { Button } from "@superset/ui/button";
import { useCallback, useEffect, useRef } from "react";
import { HiXMark } from "react-icons/hi2";
import { LuTerminal } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider";
import {
	agentScreenOperations,
	type TerminalPane as TerminalPaneType,
} from "renderer/stores/agent-screens";

interface TerminalPaneProps {
	pane: TerminalPaneType;
	screenId: string;
	paneId: string;
	workspaceId: string;
}

export function TerminalPane({
	pane,
	screenId,
	paneId,
	workspaceId,
}: TerminalPaneProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<import("@xterm/xterm").Terminal | null>(null);
	const fitAddonRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
	const collections = useCollections();

	// Use the screen's paneId prefixed with "screen-" to avoid collision with workspace terminal panes
	const sessionId = pane.sessionId ?? `screen-${screenId}-${paneId}`;

	// Create or attach to terminal session
	const createOrAttach = electronTrpc.terminal.createOrAttach.useMutation();
	const write = electronTrpc.terminal.write.useMutation();
	const resize = electronTrpc.terminal.resize.useMutation();

	// Subscribe to terminal data stream
	electronTrpc.terminal.stream.useSubscription(sessionId, {
		onData: (event) => {
			if (event.type === "data" && xtermRef.current) {
				xtermRef.current.write(event.data);
			}
		},
	});

	// Initialize terminal
	useEffect(() => {
		if (!containerRef.current) return;

		let isMounted = true;

		const initTerminal = async () => {
			// Dynamically import xterm to avoid SSR issues
			const { Terminal } = await import("@xterm/xterm");
			const { FitAddon } = await import("@xterm/addon-fit");
			await import("@xterm/xterm/css/xterm.css");

			if (!isMounted || !containerRef.current) return;

			// Create xterm instance
			const xterm = new Terminal({
				cursorBlink: true,
				fontSize: 13,
				fontFamily: "JetBrains Mono, Menlo, Monaco, Consolas, monospace",
				theme: {
					background: "#1a1a1a",
					foreground: "#e5e5e5",
					cursor: "#e5e5e5",
				},
			});

			const fitAddon = new FitAddon();
			xterm.loadAddon(fitAddon);

			xterm.open(containerRef.current);
			fitAddon.fit();

			xtermRef.current = xterm;
			fitAddonRef.current = fitAddon;

			// Handle input
			xterm.onData((data) => {
				write.mutate({ paneId: sessionId, data });
			});

			// Create or attach to session
			try {
				const result = await createOrAttach.mutateAsync({
					paneId: sessionId,
					tabId: screenId,
					workspaceId,
					cols: xterm.cols,
					rows: xterm.rows,
					allowKilled: true,
				});

				// Write scrollback if available
				if (result.scrollback) {
					xterm.write(result.scrollback);
				}

				// Save session ID to pane
				agentScreenOperations.updatePane(
					collections.agentScreens,
					screenId,
					paneId,
					{ sessionId },
				);
			} catch (error) {
				console.error("[TerminalPane] Failed to create session:", error);
			}
		};

		initTerminal();

		// Handle resize
		const resizeObserver = new ResizeObserver(() => {
			if (fitAddonRef.current && xtermRef.current) {
				fitAddonRef.current.fit();
				resize.mutate({
					paneId: sessionId,
					cols: xtermRef.current.cols,
					rows: xtermRef.current.rows,
				});
			}
		});

		if (containerRef.current) {
			resizeObserver.observe(containerRef.current);
		}

		return () => {
			isMounted = false;
			resizeObserver.disconnect();
			xtermRef.current?.dispose();
			xtermRef.current = null;
			fitAddonRef.current = null;
		};
	}, [
		sessionId,
		screenId,
		paneId,
		workspaceId,
		createOrAttach,
		write,
		resize,
		collections.agentScreens,
	]);

	const handleClose = useCallback(() => {
		agentScreenOperations.removePane(
			collections.agentScreens,
			screenId,
			paneId,
		);
	}, [screenId, paneId, collections.agentScreens]);

	return (
		<div className="w-full h-full flex flex-col bg-[#1a1a1a]">
			{/* Terminal toolbar */}
			<div className="shrink-0 h-8 px-2 flex items-center justify-between border-b border-border/30 bg-[#1a1a1a]">
				<div className="flex items-center gap-2">
					<LuTerminal className="w-3.5 h-3.5 text-muted-foreground" />
					<span className="text-xs text-muted-foreground">Terminal</span>
				</div>
				<Button
					variant="ghost"
					size="icon"
					className="h-6 w-6"
					onClick={handleClose}
					title="Close pane"
				>
					<HiXMark className="w-3 h-3" />
				</Button>
			</div>

			{/* Terminal container */}
			<div ref={containerRef} className="flex-1 overflow-hidden" />
		</div>
	);
}

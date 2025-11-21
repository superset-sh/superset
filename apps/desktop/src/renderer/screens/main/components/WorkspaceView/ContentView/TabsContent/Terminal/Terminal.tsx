import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "renderer/lib/trpc";

interface TerminalProps {
	tabId: string;
	workspaceId: string;
}

// Debounce function
function debounce<T extends (...args: never[]) => void>(
	func: T,
	wait: number,
): T & { cancel: () => void } {
	let timeout: NodeJS.Timeout | null = null;

	const debounced = ((...args: Parameters<T>) => {
		if (timeout) clearTimeout(timeout);
		timeout = setTimeout(() => func(...args), wait);
	}) as T & { cancel: () => void };

	debounced.cancel = () => {
		if (timeout) clearTimeout(timeout);
	};

	return debounced;
}

export const Terminal = ({ tabId, workspaceId }: TerminalProps) => {
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const [isExited, setIsExited] = useState(false);

	// Mutations
	const createOrAttach = trpc.terminal.createOrAttach.useMutation();
	const write = trpc.terminal.write.useMutation();
	const resize = trpc.terminal.resize.useMutation();
	const detach = trpc.terminal.detach.useMutation();

	// Subscribe to terminal output
	trpc.terminal.stream.useSubscription(tabId, {
		onData: (event) => {
			if (event.type === "data") {
				xtermRef.current?.write(event.data);
			} else if (event.type === "exit") {
				setIsExited(true);
				xtermRef.current?.writeln(
					`\r\n\r\n[Process exited with code ${event.exitCode}]`,
				);
				xtermRef.current?.writeln("[Press any key to restart]");
			}
		},
	});

	// Debounced resize handler
	const debouncedResize = useCallback(
		debounce((cols: number, rows: number) => {
			resize.mutate({ tabId, cols, rows });
		}, 150),
		[resize, tabId],
	);

	// Initialize terminal
	useEffect(() => {
		if (!terminalRef.current) return;

		// Create xterm instance
		const xterm = new XTerm({
			cursorBlink: true,
			fontSize: 14,
			fontFamily: 'Menlo, Monaco, "Courier New", monospace',
			theme: {
				background: "#000000",
				foreground: "#d4d4d4",
				cursor: "#d4d4d4",
				black: "#000000",
				red: "#cd3131",
				green: "#0dbc79",
				yellow: "#e5e510",
				blue: "#2472c8",
				magenta: "#bc3fbc",
				cyan: "#11a8cd",
				white: "#e5e5e5",
				brightBlack: "#666666",
				brightRed: "#f14c4c",
				brightGreen: "#23d18b",
				brightYellow: "#f5f543",
				brightBlue: "#3b8eea",
				brightMagenta: "#d670d6",
				brightCyan: "#29b8db",
				brightWhite: "#e5e5e5",
			},
			allowProposedApi: true,
		});

		// Create and load addons
		const fitAddon = new FitAddon();
		const webLinksAddon = new WebLinksAddon();

		xterm.loadAddon(fitAddon);
		xterm.loadAddon(webLinksAddon);

		// Open terminal in the DOM
		xterm.open(terminalRef.current);

		// Fit terminal to container
		fitAddon.fit();

		// Store references
		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;

		// Create or attach to terminal session
		createOrAttach.mutate(
			{
				tabId,
				workspaceId,
				cols: xterm.cols,
				rows: xterm.rows,
			},
			{
				onSuccess: (result) => {
					// Replay scrollback if reattaching to existing session
					if (!result.isNew && result.scrollback.length > 0) {
						// Write history directly - it's already a raw string with ANSI codes
						xterm.write(result.scrollback[0]);
					}
				},
			},
		);

		// Handle user input
		const disposable = xterm.onData((data) => {
			if (isExited) {
				// Restart terminal on any key press after exit
				setIsExited(false);
				xterm.clear();
				createOrAttach.mutate({
					tabId,
					workspaceId,
					cols: xterm.cols,
					rows: xterm.rows,
				});
			} else {
				// Send input to terminal
				write.mutate({ tabId, data });
			}
		});

		// Handle window and container resize
		const handleResize = () => {
			fitAddon.fit();
			debouncedResize(xterm.cols, xterm.rows);
		};

		const resizeObserver = new ResizeObserver(handleResize);
		if (terminalRef.current) {
			resizeObserver.observe(terminalRef.current);
		}

		window.addEventListener("resize", handleResize);

		// Cleanup
		return () => {
			disposable.dispose();
			window.removeEventListener("resize", handleResize);
			resizeObserver.disconnect();
			debouncedResize.cancel();

			// Detach from terminal (keep session alive)
			detach.mutate({ tabId });

			xterm.dispose();
		};
		// Note: Dependencies intentionally minimal to avoid recreating terminal on every state change
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tabId, workspaceId]);

	return (
		<div className="h-full w-full overflow-hidden bg-black">
			<div ref={terminalRef} className="h-full w-full p-2" />
		</div>
	);
};

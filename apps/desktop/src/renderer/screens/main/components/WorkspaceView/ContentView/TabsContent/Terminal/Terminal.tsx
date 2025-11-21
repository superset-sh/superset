import { type ITheme, Terminal as XTerm } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { trpc } from "lib/trpc";

interface TerminalProps {
	terminalId: string;
	cwd: string;
	hidden?: boolean;
	onFocus?: () => void;
}

const TERMINAL_THEME: Record<"LIGHT" | "DARK", ITheme> = {
	LIGHT: {
		background: "#ffffff",
		foreground: "#2d2d2d",
		cursor: "#333333",
		cursorAccent: "#ffffff",
		black: "#2d2d2d",
		red: "#d64646",
		green: "#4e9a06",
		yellow: "#c4a000",
		blue: "#3465a4",
		magenta: "#75507b",
		cyan: "#06989a",
		white: "#d3d7cf",
		brightBlack: "#555753",
		brightRed: "#ef2929",
		brightGreen: "#8ae234",
		brightYellow: "#fce94f",
		brightBlue: "#729fcf",
		brightMagenta: "#ad7fa8",
		brightCyan: "#34e2e2",
		brightWhite: "#eeeeec",
		selectionBackground: "#bfbfbf",
	},
	DARK: {
		background: "#1e1e1e",
		foreground: "#d4d4d4",
		cursor: "#d4d4d4",
		cursorAccent: "#1e1e1e",
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
};

export function Terminal({
	terminalId,
	cwd,
	hidden = false,
	onFocus,
}: TerminalProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [terminal, setTerminal] = useState<XTerm | null>(null);
	const [theme] = useState<"light" | "dark">("dark");
	const isInitializedRef = useRef(false);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const hasBeenVisibleRef = useRef(false);

	// tRPC mutations
	const createTerminal = trpc.terminal.create.useMutation();
	const resizeTerminal = trpc.terminal.resize.useMutation();
	const executeCommand = trpc.terminal.executeCommand.useMutation();

	// Update theme when it changes
	useEffect(() => {
		if (terminal) {
			terminal.options.theme =
				theme === "light" ? TERMINAL_THEME.LIGHT : TERMINAL_THEME.DARK;
		}
	}, [theme, terminal]);

	// Handle visibility changes - fit terminal when it becomes visible
	useEffect(() => {
		if (!hidden && terminal && fitAddonRef.current && containerRef.current) {
			hasBeenVisibleRef.current = true;

			// Fit terminal when it becomes visible
			let attempts = 0;
			const maxAttempts = 10;
			const retryDelay = 50;

			const tryFit = () => {
				const rect = containerRef.current?.getBoundingClientRect();
				if (rect && rect.width > 0 && rect.height > 0) {
					fitAddonRef.current?.fit();
				} else if (attempts < maxAttempts) {
					attempts++;
					setTimeout(tryFit, retryDelay);
				}
			};

			const timer = setTimeout(tryFit, 50);
			return () => clearTimeout(timer);
		}
	}, [hidden, terminal]);

	// Initialize terminal once
	useEffect(() => {
		if (!containerRef.current || isInitializedRef.current) {
			return;
		}

		isInitializedRef.current = true;

		// Create terminal instance
		const term = new XTerm({
			cursorBlink: true,
			fontSize: 12,
			fontFamily: 'Menlo, Monaco, "Courier New", monospace',
			theme: theme === "light" ? TERMINAL_THEME.LIGHT : TERMINAL_THEME.DARK,
			scrollback: 9999999,
			macOptionClickForcesSelection: true,
			rightClickSelectsWord: true,
		});

		term.open(containerRef.current);

		// Track disposal state
		let isDisposed = false;

		// Set up keyboard shortcuts
		term.attachCustomKeyEventHandler((e: KeyboardEvent): boolean => {
			// Cmd+K: Clear terminal
			if (
				e.key === "k" &&
				e.metaKey &&
				!e.ctrlKey &&
				!e.altKey &&
				!e.shiftKey
			) {
				e.preventDefault();
				term.clear();
				// TODO: Send clear command via tRPC
				executeCommand.mutate({
					id: terminalId,
					command: "\x0c", // Form feed (Ctrl+L)
				});
				return false;
			}

			// Cmd+W: Prevent from being sent to shell
			if (
				e.key === "w" &&
				e.metaKey &&
				!e.ctrlKey &&
				!e.altKey &&
				!e.shiftKey
			) {
				e.preventDefault();
				return false;
			}

			return true;
		});

		// Load addons
		const webLinksAddon = new WebLinksAddon((event, uri) => {
			event.preventDefault();
			// Open external links in default browser
			window.open(uri, "_blank");
		});
		term.loadAddon(webLinksAddon);

		const fitAddon = new FitAddon();
		term.loadAddon(fitAddon);
		fitAddonRef.current = fitAddon;

		const searchAddon = new SearchAddon();
		term.loadAddon(searchAddon);

		// Custom fit function
		const customFit = () => {
			if (isDisposed || !containerRef.current) return;

			try {
				const rect = containerRef.current.getBoundingClientRect();
				if (rect.width <= 0 || rect.height <= 0) return;

				const dimensions = fitAddon.proposeDimensions();
				if (dimensions) {
					term.resize(dimensions.cols, dimensions.rows);
				}
			} catch (error) {
				// Ignore dimension errors during terminal initialization
				console.debug("Terminal fit error (expected during init):", error);
			}
		};

		// Perform initial fit after a small delay to ensure terminal is ready
		setTimeout(() => {
			if (!isDisposed) {
				customFit();
			}
		}, 0);

		// Handle mouse wheel scrolling (disabled for now since we're using mock terminal)
		// TODO: Re-enable when real terminal is implemented
		term.attachCustomWheelEventHandler(() => {
			// Allow default xterm scrolling behavior for now
			return true;
		});

		// Create terminal session
		const dimensions = fitAddon.proposeDimensions();
		const cols = dimensions?.cols || 80;
		const rows = dimensions?.rows || 30;

		createTerminal.mutate({
			id: terminalId,
			cwd,
			cols,
			rows,
		});

		// Handle resize with debouncing
		let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
		const handleResize = () => {
			if (resizeTimeout) {
				clearTimeout(resizeTimeout);
			}

			resizeTimeout = setTimeout(() => {
				if (!isDisposed) {
					customFit();
				}
				resizeTimeout = null;
			}, 150);
		};

		const resizeObserver = new ResizeObserver(handleResize);
		resizeObserver.observe(containerRef.current);
		window.addEventListener("resize", handleResize);

		// Write welcome message for mock terminal
		const welcomeMessage = `\x1b[1;36mWelcome to Superset Terminal\x1b[0m\r\n\x1b[90mType any command and press Enter to test (mock mode)\x1b[0m\r\n\r\n$ `;
		term.write(welcomeMessage);

		// Simple mock input handler
		let currentLine = "";
		term.onData((data) => {
			// Handle Enter key
			if (data === "\r") {
				term.write("\r\n");
				if (currentLine.trim()) {
					// Mock command execution
					executeCommand.mutate({
						id: terminalId,
						command: currentLine,
					});
					term.write(
						`\x1b[90m[Mock] Command "${currentLine}" received\x1b[0m\r\n`,
					);
				}
				currentLine = "";
				term.write("$ ");
			}
			// Handle Backspace
			else if (data === "\x7f") {
				if (currentLine.length > 0) {
					currentLine = currentLine.slice(0, -1);
					term.write("\b \b");
				}
			}
			// Handle Ctrl+C
			else if (data === "\x03") {
				term.write("^C\r\n$ ");
				currentLine = "";
			}
			// Regular character
			else if (!data.startsWith("\x1b")) {
				currentLine += data;
				term.write(data);
			}
		});

		// Track current dimensions
		let currentDimensions = { cols: 80, rows: 30 };
		let resizeSeq = 0;
		let isInitialSetup = true;

		// Delay marking initial setup as complete
		setTimeout(() => {
			isInitialSetup = false;
		}, 100);

		term.onResize(({ cols, rows }) => {
			if (isInitialSetup) return;

			if (currentDimensions.cols === cols && currentDimensions.rows === rows) {
				return;
			}

			currentDimensions = { cols, rows };
			resizeSeq += 1;

			resizeTerminal.mutate({
				id: terminalId,
				cols,
				rows,
				seq: resizeSeq,
			});
		});

		// Handle focus
		const handleFocus = () => {
			if (onFocus) {
				onFocus();
			}
		};

		if (term.textarea) {
			term.textarea.addEventListener("focus", handleFocus);
		}

		setTerminal(term);

		// Cleanup
		return () => {
			isDisposed = true;

			if (resizeTimeout) {
				clearTimeout(resizeTimeout);
			}

			resizeObserver.disconnect();
			window.removeEventListener("resize", handleResize);

			if (term.textarea) {
				term.textarea.removeEventListener("focus", handleFocus);
			}

			fitAddon.dispose();
			searchAddon.dispose();
			webLinksAddon.dispose();
			term.dispose();
		};
	}, [terminalId, cwd, theme, onFocus, createTerminal, resizeTerminal, executeCommand]);

	return (
		<div
			ref={containerRef}
			className={`h-full w-full transition-opacity duration-200 text-start [&_.xterm-screen]:p-0! ${
				hidden ? "opacity-0" : "opacity-100 delay-300"
			}`}
		/>
	);
}

import { type ITheme, Terminal as XTerm } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";

// WebglAddon disabled due to cursor positioning issues with autocomplete
// import { WebglAddon } from "@xterm/addon-webgl";

// Custom styles for terminal padding
const terminalStyles = `
	.terminal-with-padding .xterm-screen {
		padding: 8px;
	}
`;

interface TerminalProps {
	terminalId?: string | null;
	hidden?: boolean;
	className?: string;
	onFocus?: () => void;
}

interface TerminalMessage {
	id: string;
	data: string;
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

export default function TerminalComponent({
	terminalId,
	hidden = false,
	className = "",
	onFocus,
}: TerminalProps) {
	const terminalRef = useRef<HTMLDivElement>(null);
	const [terminal, setTerminal] = useState<XTerm | null>(null);
	const [theme] = useState<"light" | "dark">("dark"); // Can be connected to theme provider later
	const terminalIdRef = useRef<string | null>(null);
	const onFocusRef = useRef(onFocus);
	const fitFunctionRef = useRef<(() => void) | null>(null);

	// Update the ref when onFocus changes
	useEffect(() => {
		onFocusRef.current = onFocus;
	}, [onFocus]);

	useEffect(() => {
		if (terminal) {
			terminal.options.theme =
				theme === "light" ? TERMINAL_THEME.LIGHT : TERMINAL_THEME.DARK;
		}
	}, [theme, terminal]);

	useEffect(() => {
		if (!terminalRef.current || terminal || !terminalId) {
			return;
		}

		const { term, terminalDataListener, cleanup, fit } = initTerminal(
			terminalRef.current,
			theme,
			onFocusRef,
		);
		setTerminal(term);
		fitFunctionRef.current = fit;

		return () => {
			// Don't dispose XTerm or cleanup on unmount
			// XTerm instances should persist through reordering
			// They will only be cleaned up when the tab is removed from config
		};
	}, [theme, terminalId]);

	function initTerminal(
		container: HTMLDivElement,
		currentTheme: "light" | "dark",
		focusCallbackRef: React.MutableRefObject<(() => void) | undefined>,
	) {
		const term = new XTerm({
			cursorBlink: true,
			fontSize: 12,
			fontFamily: 'Menlo, Monaco, "Courier New", monospace',
			theme:
				currentTheme === "light" ? TERMINAL_THEME.LIGHT : TERMINAL_THEME.DARK,
			allowTransparency: true,
			disableStdin: false,
			// Add scrollback configuration for better history handling
			scrollback: 10000,
			// Enable alternate screen for better full-screen app support
			altClickMovesCursor: false,
		});

		term.open(container);

		// Track if terminal is disposed to prevent operations on disposed terminal
		let isDisposed = false;
		// Track if this is the initial setup to prevent resize events during reconnection
		let isInitialSetup = true;
		// Buffer to queue writes during resize operations to prevent cursor desync
		let isResizing = false;
		let writeQueue: string[] = [];

		// Add iTerm2-like keyboard shortcuts
		term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
			// Cmd+K (Mac) or Ctrl+K (Win/Linux): Clear terminal like iTerm2
			// This clears both the scrollback buffer and sends clear to the shell
			if (event.metaKey && event.key === "k") {
				event.preventDefault();
				// Clear the xterm buffer (removes scrollback)
				term.clear();
				// Also send clear command to shell to reset shell state
				if (terminalIdRef.current) {
					window.ipcRenderer.send("terminal-input", {
						id: terminalIdRef.current,
						data: "\x0c", // Form feed (Ctrl+L) - clears screen in most shells
					});
				}
				return false; // Prevent default terminal handling
			}
			// Allow all other keys to be processed normally
			return true;
		});

		// Load addons
		// 1. WebLinks - Makes URLs clickable and open in default browser
		const webLinksAddon = new WebLinksAddon((event, uri) => {
			event.preventDefault();
			window.ipcRenderer.invoke("open-external", uri);
		});
		term.loadAddon(webLinksAddon);

		// 2. WebGL Renderer - DISABLED due to cursor positioning issues with autocomplete
		// WebGL can cause cursor desynchronization when shell sends rapid escape sequences
		// Canvas renderer is more stable for autocomplete and dynamic content
		// Uncomment the lines below to re-enable WebGL if needed
		// const webglAddon: WebglAddon | null = null;
		// try {
		// 	webglAddon = new WebglAddon();
		// 	term.loadAddon(webglAddon);
		// } catch (e) {
		// 	console.warn("WebGL addon failed to load, falling back to canvas:", e);
		// }

		// 3. FitAddon - Automatically fit terminal to container
		const fitAddon = new FitAddon();
		term.loadAddon(fitAddon);

		// Custom fit function that accounts for container dimensions properly
		const customFit = () => {
			if (isDisposed) return;

			try {
				// Get the actual dimensions of the container
				const rect = container.getBoundingClientRect();
				const width = rect.width;
				const height = rect.height;

				if (width <= 0 || height <= 0) {
					return; // Skip if container has no dimensions yet
				}

				// Use proposeDimensions to calculate optimal size without applying it
				// Then manually resize to ensure PTY gets the correct dimensions
				const dimensions = fitAddon.proposeDimensions();
				if (dimensions) {
					term.resize(dimensions.cols, dimensions.rows);
				}
			} catch (e) {
				console.warn("Custom fit failed:", e);
			}
		};

		// 4. SearchAddon - Enable text searching (Ctrl+F or Cmd+F)
		const searchAddon = new SearchAddon();
		term.loadAddon(searchAddon);

		// Function to process queued writes after resize completes
		const processWriteQueue = () => {
			if (isResizing || writeQueue.length === 0) {
				return;
			}
			const data = writeQueue.join("");
			writeQueue = [];
			term.write(data);
		};

		// Perform initial fit to size terminal correctly on first render
		// This ensures the terminal has correct dimensions when it first appears
		customFit();

		// Listen for container resize to auto-fit terminal
		// Use ResizeObserver to detect when the container size changes
		// Debounce resize to prevent excessive fit calls that cause terminal corruption
		// Each terminal gets its own independent debounce timeout
		let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
		const handleResize = () => {
			if (resizeTimeout) {
				clearTimeout(resizeTimeout);
			}
			// Mark as resizing to queue incoming writes
			isResizing = true;

			resizeTimeout = setTimeout(() => {
				if (!isDisposed) {
					customFit();
					// Small delay to allow PTY to receive resize before processing writes
					setTimeout(() => {
						isResizing = false;
						processWriteQueue();
					}, 50);
				}
				resizeTimeout = null;
			}, 150);
		};

		// Observe container size changes
		const resizeObserver = new ResizeObserver(handleResize);
		resizeObserver.observe(container);

		// Also listen for window resize as fallback
		window.addEventListener("resize", handleResize);

		// Use the provided terminalId from props
		if (terminalId) {
			terminalIdRef.current = terminalId;

			// Get terminal history for existing terminal
			window.ipcRenderer
				.invoke("terminal-get-history", terminalId)
				.then((history: string | undefined) => {
					if (history) {
						// Debug: log the last characters of history
						console.log(
							"History last 50 chars:",
							JSON.stringify(history.slice(-50)),
						);
						// Write history directly - PTY data already has proper formatting
						term.write(history);

						// Delay initial fit AFTER writing history to prevent resize events
						// from triggering the shell to redraw the prompt
						setTimeout(() => {
							if (!isDisposed) {
								customFit();
								// Mark initial setup as complete after first fit
								isInitialSetup = false;
							}
						}, 100);
					}
				})
				.catch((error: Error) => {
					console.error("Failed to get terminal history:", error);
					// Mark initial setup as complete even on error
					isInitialSetup = false;
				});
		} else {
			// Mark initial setup as complete for new terminals
			// Initial fit was already performed above
			setTimeout(() => {
				if (!isDisposed) {
					isInitialSetup = false;
				}
			}, 100);
		}

		// Set up event listeners
		term.onData((data) => {
			if (terminalIdRef.current) {
				window.ipcRenderer.send("terminal-input", {
					id: terminalIdRef.current,
					data,
				});
			}
		});

		// Store current dimensions to detect actual changes
		let currentDimensions = { cols: 80, rows: 30 };

		term.onResize(({ cols, rows }) => {
			// Skip resize events during initial setup to prevent shell from redrawing prompt
			// when reconnecting to an existing terminal
			if (isInitialSetup) {
				return;
			}

			// Only send resize if dimensions actually changed
			// This prevents redundant resize events that can cause cursor issues
			if (currentDimensions.cols === cols && currentDimensions.rows === rows) {
				return;
			}

			currentDimensions = { cols, rows };

			if (terminalIdRef.current) {
				window.ipcRenderer.send("terminal-resize", {
					id: terminalIdRef.current,
					cols,
					rows,
				});
			}
		});

		const terminalDataListener = (message: TerminalMessage) => {
			if (message?.id === terminalIdRef.current) {
				// If we're in the middle of a resize, queue the write
				if (isResizing) {
					writeQueue.push(message.data);
				} else {
					term.write(message.data);
				}
			}
		};

		window.ipcRenderer.on("terminal-on-data", terminalDataListener);

		// Handle terminal focus to make it the active tab
		// XTerm doesn't have onFocus, but we can listen to the textarea element
		const textarea = term.textarea;
		const handleFocus = () => {
			if (focusCallbackRef.current) {
				focusCallbackRef.current();
			}
		};

		if (textarea) {
			textarea.addEventListener("focus", handleFocus);
		}

		const cleanup = () => {
			isDisposed = true;

			// Clear any pending resize timeout
			if (resizeTimeout) {
				clearTimeout(resizeTimeout);
				resizeTimeout = null;
			}

			// Disconnect resize observer
			resizeObserver.disconnect();

			// Remove focus listener
			if (textarea) {
				textarea.removeEventListener("focus", handleFocus);
			}

			window.ipcRenderer.off("terminal-on-data", terminalDataListener);
			window.removeEventListener("resize", handleResize);

			// Dispose addons before terminal
			try {
				fitAddon.dispose();
			} catch (e) {
				console.warn("FitAddon disposal failed:", e);
			}
			try {
				searchAddon.dispose();
			} catch (e) {
				console.warn("SearchAddon disposal failed:", e);
			}
			try {
				webLinksAddon.dispose();
			} catch (e) {
				console.warn("WebLinksAddon disposal failed:", e);
			}
			// WebGL addon disposal removed (addon disabled)
			// if (webglAddon) {
			// 	try {
			// 		webglAddon.dispose();
			// 	} catch (e) {
			// 		console.warn("WebglAddon disposal failed:", e);
			// 	}
			// }

			// Terminal process lifecycle is managed by ScreenLayout
			// Don't kill it here to avoid conflicts
		};

		return { term, terminalDataListener, cleanup, fit: customFit };
	}

	return (
		<>
			<style>{terminalStyles}</style>
			<div
				ref={terminalRef}
				className={`terminal-with-padding h-full w-full transition-opacity duration-200 text-start ${hidden ? "opacity-0" : "opacity-100 delay-300"}`}
			/>
		</>
	);
}

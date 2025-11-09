import { type ITheme, Terminal as XTerm } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { createShortcutHandler } from "../../../../lib/keyboard-shortcuts";
import { createTerminalShortcuts } from "../../../../lib/shortcuts";

// WebglAddon disabled due to cursor positioning issues with autocomplete
// import { WebglAddon } from "@xterm/addon-webgl";

interface TerminalProps {
	terminalId?: string | null;
	hidden?: boolean;
	onFocus?: () => void;
	cwd?: string;
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
	onFocus,
	cwd,
}: TerminalProps) {
	const terminalRef = useRef<HTMLDivElement>(null);
	const [terminal, setTerminal] = useState<XTerm | null>(null);
	const [theme] = useState<"light" | "dark">("dark"); // Can be connected to theme provider later
	const terminalIdRef = useRef<string | null>(null); // Also serves as initialization guard
	const onFocusRef = useRef(onFocus);
	const fitFunctionRef = useRef<(() => void) | null>(null);
	const hasBeenVisibleRef = useRef(false);

	// Log visibility changes for debugging
	console.log(
		`[Terminal] Render: ${terminalId?.slice(0, 8)} hidden=${hidden} terminal=${!!terminal}`,
	);

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

	// Handle visibility changes - fit terminal when it becomes visible
	useEffect(() => {
		console.log(
			`[Terminal] Visibility effect fired: ${terminalIdRef.current?.slice(0, 8)} hidden=${hidden} terminal=${!!terminal} hasBeenVisible=${hasBeenVisibleRef.current}`,
		);

		if (!hidden && terminal && fitFunctionRef.current && terminalRef.current) {
			const isFirstTimeVisible = !hasBeenVisibleRef.current;
			hasBeenVisibleRef.current = true;

			// When terminal becomes visible, ensure it fits the container
			// Retry logic to handle cases where container dimensions aren't available immediately
			let attempts = 0;
			const maxAttempts = 10;
			const retryDelay = 50;

			const tryFit = () => {
				const rect = terminalRef.current?.getBoundingClientRect();
				if (rect && rect.width > 0 && rect.height > 0) {
					console.log(
						`[Terminal] Fitting terminal ${terminalIdRef.current?.slice(0, 8)} after becoming visible (attempt ${attempts + 1}, firstTime=${isFirstTimeVisible})`,
					);
					fitFunctionRef.current?.();
				} else if (attempts < maxAttempts) {
					attempts++;
					console.log(
						`[Terminal] Container not ready for ${terminalIdRef.current?.slice(0, 8)}, retrying... (${rect?.width}x${rect?.height})`,
					);
					setTimeout(tryFit, retryDelay);
				} else {
					console.warn(
						`[Terminal] Failed to fit ${terminalIdRef.current} after ${maxAttempts} attempts`,
					);
				}
			};

			// Start with a small initial delay
			const timer = setTimeout(tryFit, 50);
			return () => clearTimeout(timer);
		}
	}, [hidden, terminal]);

	useEffect(() => {
		// Guard: only initialize once per terminalId
		// terminalIdRef serves as both storage and initialization guard
		if (
			!terminalRef.current ||
			terminal ||
			!terminalId ||
			terminalIdRef.current === terminalId
		) {
			return;
		}

		console.log(`[Terminal] Initializing terminal: ${terminalId.slice(0, 8)}`);

		// Set terminalIdRef immediately to prevent race conditions
		terminalIdRef.current = terminalId;

		const { term } = initTerminal(terminalRef.current, theme, onFocusRef);
		setTerminal(term);

		console.log(`[Terminal] Initialized terminal: ${terminalId.slice(0, 8)}`);

		return () => {
			// Don't dispose XTerm or cleanup on unmount
			// XTerm instances should persist through reordering
			// They will only be cleaned up when the tab is removed from config
		};
	}, [terminalId]); // Only re-run when terminalId changes

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
			scrollback: 9999999, // Very large scrollback buffer (practical maximum)
			// Use xterm.js defaults for all other settings to match standard terminal behavior
			// scrollOnUserInput: true (default)
			// altClickMovesCursor: true (default - matches iTerm2)
			// convertEol: false (default - PTY handles EOL conversion)
			// fastScrollModifier: "alt" (default)
		});

		term.open(container);

		// Track if terminal is disposed to prevent operations on disposed terminal
		let isDisposed = false;
		// Track if this is the initial setup to prevent resize events during reconnection
		let isInitialSetup = true;
		// Buffer to queue writes during resize operations to prevent cursor desync
		let isResizing = false;
		let writeQueue: string[] = [];

		// Set up keyboard shortcuts
		const terminalShortcuts = createTerminalShortcuts({
			clearTerminal: () => {
				// Clear the xterm buffer (removes scrollback)
				term.clear();
				// Also send clear command to shell to reset shell state
				if (terminalIdRef.current) {
					window.ipcRenderer.send("terminal-input", {
						id: terminalIdRef.current,
						data: "\x0c", // Form feed (Ctrl+L) - clears screen in most shells
					});
				}
			},
		});

		const handleShortcut = createShortcutHandler(terminalShortcuts.shortcuts);
		term.attachCustomKeyEventHandler(handleShortcut);

		// Load addons
		// 1. WebLinks - Makes URLs clickable and open in default browser
		const webLinksAddon = new WebLinksAddon((event, uri) => {
			event.preventDefault();
			window.ipcRenderer.invoke("open-external", uri);
		});
		term.loadAddon(webLinksAddon);

		// 2. FitAddon - Automatically fit terminal to container
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
					console.log(
						`[Terminal] Skipping fit for ${terminalIdRef.current} - container has no dimensions (${width}x${height})`,
					);
					return; // Skip if container has no dimensions yet
				}

				// Use proposeDimensions to calculate optimal size without applying it
				// Then manually resize to ensure PTY gets the correct dimensions
				const dimensions = fitAddon.proposeDimensions();
				if (dimensions) {
					console.log(
						`[Terminal] Fitting ${terminalIdRef.current} to ${dimensions.cols}x${dimensions.rows}`,
					);
					term.resize(dimensions.cols, dimensions.rows);
				}
			} catch (e) {
				console.warn("Custom fit failed:", e);
			}
		};

		// Store the fit function so it can be called from useEffect when visibility changes
		fitFunctionRef.current = customFit;

		// 3. SearchAddon - Enable text searching (Ctrl+F or Cmd+F)
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

		// Create/attach terminal session with proper dimensions
		// This is deferred until the terminal is initialized so we can pass correct cols/rows
		if (terminalId && cwd) {
			const dimensions = fitAddon.proposeDimensions();
			const cols = dimensions?.cols || 80;
			const rows = dimensions?.rows || 30;

			console.log(
				`[Terminal] Creating terminal ${terminalId.slice(0, 8)} with dimensions ${cols}x${rows}`,
			);
			window.ipcRenderer
				.invoke("terminal-create", {
					id: terminalId,
					cwd,
					cols,
					rows,
				})
				.catch((error: Error) => {
					console.error("Failed to create terminal:", error);
				});
		}

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

		// terminalIdRef.current is already set in the useEffect before calling initTerminal
		// Get terminal history for existing terminal
		if (terminalId) {
			window.ipcRenderer
				.invoke("terminal-get-history", terminalId)
				.then((history: string | undefined) => {
					if (history) {
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
					} else {
						// No cached history - terminal will receive content from PTY on attach
						// Mark setup complete immediately
						isInitialSetup = false;
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
				// Filter out terminal response sequences that shouldn't be sent as input
				// These are generated by xterm.js in response to queries from the shell/tmux
				const isTerminalResponse =
					data.startsWith("\x1b[?1;") || // Primary DA response (e.g., \x1b[?1;2c)
					data.startsWith("\x1b[>") || // Secondary DA response (e.g., \x1b[>0;276;0c)
					data.startsWith("\x1b]10;") || // Foreground color query response
					data.startsWith("\x1b]11;") || // Background color query response
					data === "\x1b[I" || // Focus in event
					data === "\x1b[O"; // Focus out event

				if (isTerminalResponse) {
					console.log(
						`[Terminal] Filtered terminal response for ${terminalIdRef.current}:`,
						JSON.stringify(data),
					);
					return;
				}

				// Debug: log user input
				console.log(
					`[Terminal] User input for ${terminalIdRef.current}:`,
					JSON.stringify(data),
					`(length: ${data.length})`,
				);
				window.ipcRenderer.send("terminal-input", {
					id: terminalIdRef.current,
					data,
				});
			}
		});

		// Store current dimensions to detect actual changes
		let currentDimensions = { cols: 80, rows: 30 };
		// Monotonic sequence counter for resize events to prevent out-of-order processing
		let resizeSeq = 0;

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
				// Increment sequence number for this resize event
				resizeSeq += 1;

				window.ipcRenderer.send("terminal-resize", {
					id: terminalIdRef.current,
					cols,
					rows,
					seq: resizeSeq,
				});
			}
		});

		const terminalDataListener = (message: TerminalMessage) => {
			if (message?.id === terminalIdRef.current) {
				// Debug: log data being written to xterm
				if (message.data.includes("1;2c") || message.data.includes("0;276")) {
					console.log(
						`[Terminal] Received data for ${terminalIdRef.current}:`,
						JSON.stringify(message.data),
						`(length: ${message.data.length})`,
					);
				}
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

			// Terminal process lifecycle is managed by ScreenLayout
			// Don't kill it here to avoid conflicts
		};

		return { term };
	}

	return (
		<div
			ref={terminalRef}
			className={`h-full w-full transition-opacity duration-200 text-start [&_.xterm-screen]:!p-0 ${hidden ? "opacity-0" : "opacity-100 delay-300"}`}
		/>
	);
}

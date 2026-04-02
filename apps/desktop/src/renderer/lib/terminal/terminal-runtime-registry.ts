import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";

type ConnectionState = "disconnected" | "connecting" | "open" | "closed";

interface TerminalRuntime {
	paneId: string;
	terminal: XTerm;
	fitAddon: FitAddon;
	/** Persistent wrapper div that xterm renders into. Survives detach/reattach. */
	wrapper: HTMLDivElement;
	socket: WebSocket | null;
	connectionState: ConnectionState;
	/** The visible container element this runtime is currently attached to. */
	container: HTMLDivElement | null;
	resizeObserver: ResizeObserver | null;
	onDataDisposable: { dispose(): void } | null;
	/** Listeners notified when connectionState changes. */
	stateListeners: Set<() => void>;
}

type TerminalServerMessage =
	| { type: "data"; data: string }
	| { type: "error"; message: string }
	| { type: "exit"; exitCode: number; signal: number }
	| { type: "replay"; data: string };

function createTerminal(): { terminal: XTerm; fitAddon: FitAddon } {
	const fitAddon = new FitAddon();
	const terminal = new XTerm({
		cursorBlink: true,
		fontFamily:
			'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
		fontSize: 12,
		theme: {
			background: "#14100f",
			foreground: "#f5efe9",
		},
	});
	terminal.loadAddon(fitAddon);
	return { terminal, fitAddon };
}

function setConnectionState(runtime: TerminalRuntime, state: ConnectionState) {
	runtime.connectionState = state;
	for (const listener of runtime.stateListeners) {
		listener();
	}
}

function connectSocket(runtime: TerminalRuntime, wsUrl: string) {
	// Close any existing socket
	if (runtime.socket) {
		runtime.socket.close();
		runtime.socket = null;
	}

	setConnectionState(runtime, "connecting");
	const socket = new WebSocket(wsUrl);
	runtime.socket = socket;

	const sendResize = () => {
		if (socket.readyState !== WebSocket.OPEN) return;
		socket.send(
			JSON.stringify({
				type: "resize",
				cols: runtime.terminal.cols,
				rows: runtime.terminal.rows,
			}),
		);
	};

	socket.addEventListener("open", () => {
		if (runtime.socket !== socket) return;
		setConnectionState(runtime, "open");
		sendResize();
	});

	socket.addEventListener("message", (event) => {
		if (runtime.socket !== socket) return;
		let message: TerminalServerMessage;
		try {
			message = JSON.parse(String(event.data)) as TerminalServerMessage;
		} catch {
			runtime.terminal.writeln("\r\n[terminal] invalid server payload");
			return;
		}

		if (message.type === "data" || message.type === "replay") {
			runtime.terminal.write(message.data);
			return;
		}

		if (message.type === "error") {
			runtime.terminal.writeln(`\r\n[terminal] ${message.message}`);
			return;
		}

		if (message.type === "exit") {
			runtime.terminal.writeln(
				`\r\n[terminal] exited with code ${message.exitCode} (signal ${message.signal})`,
			);
		}
	});

	socket.addEventListener("close", () => {
		if (runtime.socket !== socket) return;
		setConnectionState(runtime, "closed");
		runtime.socket = null;
	});

	socket.addEventListener("error", () => {
		if (runtime.socket !== socket) return;
		runtime.terminal.writeln("\r\n[terminal] websocket error");
	});

	// Wire terminal input → socket
	runtime.onDataDisposable?.dispose();
	runtime.onDataDisposable = runtime.terminal.onData((data) => {
		if (socket.readyState !== WebSocket.OPEN) return;
		socket.send(JSON.stringify({ type: "input", data }));
	});

	// Set up resize observer if attached
	if (runtime.container) {
		setupResizeObserver(runtime, sendResize);
	}
}

function setupResizeObserver(
	runtime: TerminalRuntime,
	sendResize: () => void,
) {
	runtime.resizeObserver?.disconnect();
	if (!runtime.container) return;

	const observer = new ResizeObserver(() => {
		runtime.fitAddon.fit();
		sendResize();
	});
	observer.observe(runtime.container);
	runtime.resizeObserver = observer;
}

function teardownResizeObserver(runtime: TerminalRuntime) {
	runtime.resizeObserver?.disconnect();
	runtime.resizeObserver = null;
}

class TerminalRuntimeRegistryImpl {
	private runtimes = new Map<string, TerminalRuntime>();

	/**
	 * Get or create a terminal runtime for the given paneId.
	 * The xterm instance is created but not connected until attach().
	 */
	getOrCreate(paneId: string): TerminalRuntime {
		let runtime = this.runtimes.get(paneId);
		if (runtime) return runtime;

		const { terminal, fitAddon } = createTerminal();

		// Create a persistent wrapper div that xterm renders into.
		// This wrapper survives detach/reattach cycles.
		const wrapper = document.createElement("div");
		wrapper.style.width = "100%";
		wrapper.style.height = "100%";
		terminal.open(wrapper);

		runtime = {
			paneId,
			terminal,
			fitAddon,
			wrapper,
			socket: null,
			connectionState: "disconnected",
			container: null,
			resizeObserver: null,
			onDataDisposable: null,
			stateListeners: new Set(),
		};

		this.runtimes.set(paneId, runtime);
		return runtime;
	}

	/**
	 * Attach a terminal runtime to a visible DOM container and connect its websocket.
	 */
	attach(paneId: string, container: HTMLDivElement, wsUrl: string) {
		const runtime = this.getOrCreate(paneId);

		// Move the persistent wrapper into the visible container
		runtime.container = container;
		container.appendChild(runtime.wrapper);
		runtime.fitAddon.fit();
		runtime.terminal.focus();

		// Connect (or reconnect) the websocket
		connectSocket(runtime, wsUrl);
	}

	/**
	 * Detach a terminal runtime from the DOM and disconnect the websocket.
	 * The xterm instance and its buffer are preserved in memory.
	 */
	detach(paneId: string) {
		const runtime = this.runtimes.get(paneId);
		if (!runtime) return;

		// Disconnect socket — server will keep PTY alive
		if (runtime.socket) {
			runtime.socket.close();
			runtime.socket = null;
		}
		setConnectionState(runtime, "disconnected");

		// Clean up DOM observers
		teardownResizeObserver(runtime);
		runtime.onDataDisposable?.dispose();
		runtime.onDataDisposable = null;

		// Remove wrapper from container (keeps wrapper + xterm in memory)
		runtime.wrapper.remove();
		runtime.container = null;
	}

	/**
	 * Fully dispose a terminal runtime: send dispose to server, close socket,
	 * destroy xterm, and remove from registry.
	 */
	dispose(paneId: string) {
		const runtime = this.runtimes.get(paneId);
		if (!runtime) return;

		// Tell server to kill the PTY
		if (runtime.socket && runtime.socket.readyState === WebSocket.OPEN) {
			runtime.socket.send(JSON.stringify({ type: "dispose" }));
		}

		// Clean up everything
		if (runtime.socket) {
			runtime.socket.close();
			runtime.socket = null;
		}
		teardownResizeObserver(runtime);
		runtime.onDataDisposable?.dispose();
		runtime.onDataDisposable = null;
		runtime.wrapper.remove();
		runtime.terminal.dispose();
		runtime.stateListeners.clear();

		this.runtimes.delete(paneId);
	}

	/** Get all paneIds currently in the registry. */
	getAllPaneIds(): Set<string> {
		return new Set(this.runtimes.keys());
	}

	/** Check whether a runtime exists for this paneId. */
	has(paneId: string): boolean {
		return this.runtimes.has(paneId);
	}

	/** Get the connection state for a runtime. */
	getConnectionState(paneId: string): ConnectionState {
		return this.runtimes.get(paneId)?.connectionState ?? "disconnected";
	}

	/** Subscribe to connection state changes for a runtime. Returns unsubscribe fn. */
	onStateChange(paneId: string, listener: () => void): () => void {
		const runtime = this.runtimes.get(paneId);
		if (!runtime) return () => {};
		runtime.stateListeners.add(listener);
		return () => {
			runtime.stateListeners.delete(listener);
		};
	}
}

export const terminalRuntimeRegistry = new TerminalRuntimeRegistryImpl();

export type { ConnectionState };

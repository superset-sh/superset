import { FitAddon } from "@xterm/addon-fit";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal as XTerm } from "@xterm/xterm";

type ConnectionState = "disconnected" | "connecting" | "open" | "closed";

interface TerminalRuntime {
	paneId: string;
	terminal: XTerm;
	fitAddon: FitAddon;
	serializeAddon: SerializeAddon;
	/** xterm renders into this div. It is reparented between containers across attach/detach cycles. */
	wrapper: HTMLDivElement;
	socket: WebSocket | null;
	connectionState: ConnectionState;
	container: HTMLDivElement | null;
	resizeObserver: ResizeObserver | null;
	onDataDisposable: { dispose(): void } | null;
	stateListeners: Set<() => void>;
}

type TerminalServerMessage =
	| { type: "data"; data: string }
	| { type: "error"; message: string }
	| { type: "exit"; exitCode: number; signal: number }
	| { type: "replay"; data: string };

const SERIALIZE_SCROLLBACK = 1000;
const STORAGE_KEY_PREFIX = "terminal-buffer:";

function createTerminal(): {
	terminal: XTerm;
	fitAddon: FitAddon;
	serializeAddon: SerializeAddon;
} {
	const fitAddon = new FitAddon();
	const serializeAddon = new SerializeAddon();
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
	terminal.loadAddon(serializeAddon);
	return { terminal, fitAddon, serializeAddon };
}

function persistBuffer(paneId: string, serializeAddon: SerializeAddon) {
	try {
		const data = serializeAddon.serialize({ scrollback: SERIALIZE_SCROLLBACK });
		localStorage.setItem(`${STORAGE_KEY_PREFIX}${paneId}`, data);
	} catch {}
}

function restoreBuffer(paneId: string, terminal: XTerm) {
	try {
		const data = localStorage.getItem(`${STORAGE_KEY_PREFIX}${paneId}`);
		if (data) terminal.write(data);
	} catch {}
}

function clearPersistedBuffer(paneId: string) {
	try {
		localStorage.removeItem(`${STORAGE_KEY_PREFIX}${paneId}`);
	} catch {}
}

function setConnectionState(runtime: TerminalRuntime, state: ConnectionState) {
	runtime.connectionState = state;
	for (const listener of runtime.stateListeners) {
		listener();
	}
}

function connectSocket(runtime: TerminalRuntime, wsUrl: string) {
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

	runtime.onDataDisposable?.dispose();
	runtime.onDataDisposable = runtime.terminal.onData((data) => {
		if (socket.readyState !== WebSocket.OPEN) return;
		socket.send(JSON.stringify({ type: "input", data }));
	});

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

	getOrCreate(paneId: string): TerminalRuntime {
		let runtime = this.runtimes.get(paneId);
		if (runtime) return runtime;

		const { terminal, fitAddon, serializeAddon } = createTerminal();

		const wrapper = document.createElement("div");
		wrapper.style.width = "100%";
		wrapper.style.height = "100%";
		terminal.open(wrapper);
		restoreBuffer(paneId, terminal);

		runtime = {
			paneId,
			terminal,
			fitAddon,
			serializeAddon,
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

	attach(paneId: string, container: HTMLDivElement, wsUrl: string) {
		const runtime = this.getOrCreate(paneId);

		runtime.container = container;
		container.appendChild(runtime.wrapper);
		runtime.fitAddon.fit();
		runtime.terminal.focus();
		connectSocket(runtime, wsUrl);
	}

	detach(paneId: string) {
		const runtime = this.runtimes.get(paneId);
		if (!runtime) return;

		persistBuffer(paneId, runtime.serializeAddon);

		if (runtime.socket) {
			runtime.socket.close();
			runtime.socket = null;
		}
		setConnectionState(runtime, "disconnected");
		teardownResizeObserver(runtime);
		runtime.onDataDisposable?.dispose();
		runtime.onDataDisposable = null;
		runtime.wrapper.remove();
		runtime.container = null;
	}

	dispose(paneId: string) {
		const runtime = this.runtimes.get(paneId);
		if (!runtime) return;

		if (runtime.socket?.readyState === WebSocket.OPEN) {
			runtime.socket.send(JSON.stringify({ type: "dispose" }));
		}

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
		clearPersistedBuffer(paneId);

		this.runtimes.delete(paneId);
	}

	getAllPaneIds(): Set<string> {
		return new Set(this.runtimes.keys());
	}

	has(paneId: string): boolean {
		return this.runtimes.has(paneId);
	}

	getConnectionState(paneId: string): ConnectionState {
		return this.runtimes.get(paneId)?.connectionState ?? "disconnected";
	}

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

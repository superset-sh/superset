import {
	attachToContainer,
	createRuntime,
	detachFromContainer,
	disposeRuntime,
	type TerminalRuntime,
} from "./terminal-runtime";
import {
	type ConnectionState,
	connect,
	createTransport,
	disposeTransport,
	sendDispose,
	sendResize,
	setConnectionState,
	type TerminalTransport,
} from "./terminal-ws-transport";

interface RegistryEntry {
	runtime: TerminalRuntime | null;
	runtimePromise: Promise<TerminalRuntime>;
	transport: TerminalTransport;
	attachVersion: number;
	disposed: boolean;
}

class TerminalRuntimeRegistryImpl {
	private entries = new Map<string, RegistryEntry>();

	private getOrCreate(paneId: string): RegistryEntry {
		const entry = this.entries.get(paneId);
		if (entry) return entry;

		const nextEntry: RegistryEntry = {
			runtime: null,
			runtimePromise: Promise.resolve(null as never),
			transport: createTransport(),
			attachVersion: 0,
			disposed: false,
		};
		nextEntry.runtimePromise = createRuntime(paneId).then((runtime) => {
			nextEntry.runtime = runtime;
			return runtime;
		});

		this.entries.set(paneId, nextEntry);
		return nextEntry;
	}

	attach(paneId: string, container: HTMLDivElement, wsUrl: string) {
		const entry = this.getOrCreate(paneId);
		const attachVersion = ++entry.attachVersion;

		void entry.runtimePromise
			.then((runtime) => {
				if (entry.disposed) {
					disposeRuntime(runtime);
					return;
				}
				if (this.entries.get(paneId) !== entry) return;
				if (attachVersion !== entry.attachVersion) return;

				attachToContainer(runtime, container, () => {
					sendResize(
						entry.transport,
						runtime.terminal.cols,
						runtime.terminal.rows,
					);
				});

				connect(entry.transport, runtime.terminal, wsUrl);
			})
			.catch((error) => {
				console.error(
					"[terminal-v2] Failed to initialize Ghostty runtime:",
					error,
				);
				if (this.entries.get(paneId) !== entry) return;
				setConnectionState(entry.transport, "closed");
			});
	}

	/**
	 * Detach the terminal from its DOM container.
	 *
	 * This only removes the DOM attachment (wrapper, resize observer, focus).
	 * The WebSocket and terminal data flow are intentionally kept alive so output
	 * written while the pane is hidden is not lost. Disposal of the transport
	 * happens exclusively through {@link dispose} when the paneId is removed
	 * from persisted pane state.
	 */
	detach(paneId: string) {
		const entry = this.entries.get(paneId);
		if (!entry) return;
		entry.attachVersion += 1;

		if (entry.runtime) {
			detachFromContainer(entry.runtime);
		}
	}

	dispose(paneId: string) {
		const entry = this.entries.get(paneId);
		if (!entry) return;
		entry.disposed = true;
		entry.attachVersion += 1;

		sendDispose(entry.transport);
		disposeTransport(entry.transport);
		if (entry.runtime) {
			disposeRuntime(entry.runtime);
		} else {
			void entry.runtimePromise
				.then((runtime) => {
					disposeRuntime(runtime);
				})
				.catch(() => {
					// Initialization failed; nothing else to clean up.
				});
		}

		this.entries.delete(paneId);
	}

	getAllPaneIds(): Set<string> {
		return new Set(this.entries.keys());
	}

	has(paneId: string): boolean {
		return this.entries.has(paneId);
	}

	getConnectionState(paneId: string): ConnectionState {
		return (
			this.entries.get(paneId)?.transport.connectionState ?? "disconnected"
		);
	}

	onStateChange(paneId: string, listener: () => void): () => void {
		const { transport } = this.getOrCreate(paneId);
		transport.stateListeners.add(listener);
		return () => {
			transport.stateListeners.delete(listener);
		};
	}
}

export const terminalRuntimeRegistry = new TerminalRuntimeRegistryImpl();

export type { ConnectionState };

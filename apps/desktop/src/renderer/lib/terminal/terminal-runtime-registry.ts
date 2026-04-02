import {
	type TerminalRuntime,
	attachToContainer,
	createRuntime,
	detachFromContainer,
	disposeRuntime,
} from "./terminal-runtime";
import {
	type ConnectionState,
	type TerminalTransport,
	connect,
	createTransport,
	disconnect,
	disposeTransport,
	sendDispose,
	sendResize,
} from "./terminal-ws-transport";

interface RegistryEntry {
	runtime: TerminalRuntime;
	transport: TerminalTransport;
}

class TerminalRuntimeRegistryImpl {
	private entries = new Map<string, RegistryEntry>();

	private getOrCreate(paneId: string): RegistryEntry {
		let entry = this.entries.get(paneId);
		if (entry) return entry;

		entry = {
			runtime: createRuntime(paneId),
			transport: createTransport(),
		};

		this.entries.set(paneId, entry);
		return entry;
	}

	attach(paneId: string, container: HTMLDivElement, wsUrl: string) {
		const { runtime, transport } = this.getOrCreate(paneId);

		attachToContainer(runtime, container, () => {
			sendResize(transport, runtime.terminal.cols, runtime.terminal.rows);
		});

		connect(transport, runtime.terminal, wsUrl);
	}

	detach(paneId: string) {
		const entry = this.entries.get(paneId);
		if (!entry) return;

		detachFromContainer(entry.runtime);
		disconnect(entry.transport);
	}

	dispose(paneId: string) {
		const entry = this.entries.get(paneId);
		if (!entry) return;

		sendDispose(entry.transport);
		disposeTransport(entry.transport);
		disposeRuntime(entry.runtime);

		this.entries.delete(paneId);
	}

	getAllPaneIds(): Set<string> {
		return new Set(this.entries.keys());
	}

	has(paneId: string): boolean {
		return this.entries.has(paneId);
	}

	getConnectionState(paneId: string): ConnectionState {
		return this.entries.get(paneId)?.transport.connectionState ?? "disconnected";
	}

	onStateChange(paneId: string, listener: () => void): () => void {
		const entry = this.entries.get(paneId);
		if (!entry) return () => {};
		entry.transport.stateListeners.add(listener);
		return () => {
			entry.transport.stateListeners.delete(listener);
		};
	}
}

export const terminalRuntimeRegistry = new TerminalRuntimeRegistryImpl();

export type { ConnectionState };

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
	type TerminalTransport,
} from "./terminal-ws-transport";

interface RegistryEntry {
	runtime: TerminalRuntime;
	transport: TerminalTransport;
}

class TerminalRuntimeRegistryImpl {
	private entries = new Map<string, RegistryEntry>();

	private getOrCreate(terminalId: string): RegistryEntry {
		let entry = this.entries.get(terminalId);
		if (entry) return entry;

		entry = {
			runtime: createRuntime(terminalId),
			transport: createTransport(),
		};

		this.entries.set(terminalId, entry);
		return entry;
	}

	attach(terminalId: string, container: HTMLDivElement, wsUrl: string) {
		const { runtime, transport } = this.getOrCreate(terminalId);

		attachToContainer(runtime, container, () => {
			sendResize(transport, runtime.terminal.cols, runtime.terminal.rows);
		});

		connect(transport, runtime.terminal, wsUrl);
	}

	detach(terminalId: string) {
		const entry = this.entries.get(terminalId);
		if (!entry) return;

		detachFromContainer(entry.runtime);
	}

	dispose(terminalId: string) {
		const entry = this.entries.get(terminalId);
		if (!entry) return;

		sendDispose(entry.transport);
		disposeTransport(entry.transport);
		disposeRuntime(entry.runtime);

		this.entries.delete(terminalId);
	}

	getAllTerminalIds(): Set<string> {
		return new Set(this.entries.keys());
	}

	has(terminalId: string): boolean {
		return this.entries.has(terminalId);
	}

	getConnectionState(terminalId: string): ConnectionState {
		return (
			this.entries.get(terminalId)?.transport.connectionState ?? "disconnected"
		);
	}

	onStateChange(terminalId: string, listener: () => void): () => void {
		const { transport } = this.getOrCreate(terminalId);
		transport.stateListeners.add(listener);
		return () => {
			transport.stateListeners.delete(listener);
		};
	}
}

export const terminalRuntimeRegistry = new TerminalRuntimeRegistryImpl();

export type { ConnectionState };

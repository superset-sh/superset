import type { TerminalAppearance } from "./appearance";
import {
	attachToContainer,
	createRuntime,
	detachFromContainer,
	disposeRuntime,
	type TerminalRuntime,
	updateRuntimeAppearance,
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
	runtime: TerminalRuntime | null;
	transport: TerminalTransport;
}

class TerminalRuntimeRegistryImpl {
	private entries = new Map<string, RegistryEntry>();

	private getOrCreateEntry(terminalId: string): RegistryEntry {
		let entry = this.entries.get(terminalId);
		if (entry) return entry;

		entry = {
			runtime: null,
			transport: createTransport(),
		};

		this.entries.set(terminalId, entry);
		return entry;
	}

	attach(
		terminalId: string,
		container: HTMLDivElement,
		wsUrl: string,
		appearance: TerminalAppearance,
	) {
		const entry = this.getOrCreateEntry(terminalId);

		if (!entry.runtime) {
			entry.runtime = createRuntime(terminalId, appearance);
		} else {
			// Runtime already exists (reattach) — apply current appearance so
			// the first fit uses up-to-date font metrics.
			updateRuntimeAppearance(entry.runtime, appearance);
		}

		const { runtime, transport } = entry;

		attachToContainer(runtime, container, () => {
			sendResize(transport, runtime.terminal.cols, runtime.terminal.rows);
		});

		connect(transport, runtime.terminal, wsUrl);
	}

	detach(terminalId: string) {
		const entry = this.entries.get(terminalId);
		if (!entry?.runtime) return;

		detachFromContainer(entry.runtime);
	}

	updateAppearance(terminalId: string, appearance: TerminalAppearance) {
		const entry = this.entries.get(terminalId);
		if (!entry?.runtime) return;

		const prevCols = entry.runtime.terminal.cols;
		const prevRows = entry.runtime.terminal.rows;

		updateRuntimeAppearance(entry.runtime, appearance);

		// Font changes can alter the grid size — forward to the PTY so the
		// backend shell and TUIs see the correct cols/rows.
		const { cols, rows } = entry.runtime.terminal;
		if (cols !== prevCols || rows !== prevRows) {
			sendResize(entry.transport, cols, rows);
		}
	}

	dispose(terminalId: string) {
		const entry = this.entries.get(terminalId);
		if (!entry) return;

		sendDispose(entry.transport);
		disposeTransport(entry.transport);
		if (entry.runtime) disposeRuntime(entry.runtime);

		this.entries.delete(terminalId);
	}

	getSelection(terminalId: string): string {
		const entry = this.entries.get(terminalId);
		return entry?.runtime?.terminal.getSelection() ?? "";
	}

	clear(terminalId: string): void {
		const entry = this.entries.get(terminalId);
		entry?.runtime?.terminal.clear();
	}

	scrollToBottom(terminalId: string): void {
		const entry = this.entries.get(terminalId);
		entry?.runtime?.terminal.scrollToBottom();
	}

	paste(terminalId: string, text: string): void {
		const entry = this.entries.get(terminalId);
		entry?.runtime?.terminal.paste(text);
	}

	getTerminal(terminalId: string) {
		return this.entries.get(terminalId)?.runtime?.terminal ?? null;
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
		const entry = this.getOrCreateEntry(terminalId);
		entry.transport.stateListeners.add(listener);
		return () => {
			entry.transport.stateListeners.delete(listener);
		};
	}
}

export const terminalRuntimeRegistry = new TerminalRuntimeRegistryImpl();

export type { ConnectionState };

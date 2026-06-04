import type { CommandProvider } from "./types";

const providers = new Map<string, CommandProvider>();
const listeners = new Set<() => void>();
let snapshot: CommandProvider[] = [];

function rebuildSnapshot(): void {
	snapshot = Array.from(providers.values());
}

function notify(): void {
	rebuildSnapshot();
	for (const listener of listeners) listener();
}

export function registerProvider(provider: CommandProvider): () => void {
	providers.set(provider.id, provider);
	notify();
	return () => {
		providers.delete(provider.id);
		notify();
	};
}

export function getProviders(): CommandProvider[] {
	return snapshot;
}

export function subscribeToProviders(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

import type { HotkeysState } from "shared/hotkeys";
import { createJSONStorage, type StateStorage } from "zustand/middleware";
import { electronTrpcClient } from "./trpc-client";

/**
 * Flag to skip the next hotkeys persist operation.
 * Used when syncing from remote to avoid echo writes.
 */
let skipNextHotkeysPersist = false;

export function setSkipNextHotkeysPersist(skip: boolean): void {
	skipNextHotkeysPersist = skip;
}

/**
 * Creates a Zustand storage adapter that uses tRPC for persistence.
 * This ensures all state is persisted through the centralized appState lowdb instance.
 */

interface TrpcStorageConfig {
	get: () => Promise<unknown>;
	set: (input: unknown) => Promise<unknown>;
}

function createTrpcStorageAdapter(config: TrpcStorageConfig): StateStorage {
	return {
		getItem: async (name: string): Promise<string | null> => {
			try {
				const state = await config.get();
				if (!state) return null;
				// Version is stored in localStorage as a sidecar since the
				// tRPC backend validates bare state and rejects envelopes.
				const version = Number.parseInt(
					localStorage.getItem(`${name}:version`) ?? "0",
					10,
				);
				return JSON.stringify({ state, version });
			} catch (error) {
				console.error("[trpc-storage] Failed to get state:", error);
				return null;
			}
		},
		setItem: async (name: string, value: string): Promise<void> => {
			try {
				const parsed = JSON.parse(value) as {
					state: unknown;
					version: number;
				};
				// Persist version in localStorage, bare state via tRPC.
				localStorage.setItem(`${name}:version`, String(parsed.version));
				await config.set(parsed.state);
			} catch (error) {
				console.error("[trpc-storage] Failed to set state:", error);
			}
		},
		removeItem: async (_name: string): Promise<void> => {
			// Reset to empty/default state is handled by the store itself
			// No-op here as we don't want to delete persisted state
		},
	};
}

/**
 * Zustand storage adapter for tabs state using tRPC
 */
export const trpcTabsStorage = createJSONStorage(() =>
	createTrpcStorageAdapter({
		get: () => electronTrpcClient.uiState.tabs.get.query(),
		// biome-ignore lint/suspicious/noExplicitAny: Zustand persist passes unknown, tRPC expects typed input
		set: (input) => electronTrpcClient.uiState.tabs.set.mutate(input as any),
	}),
);

/**
 * Zustand storage adapter for theme state using tRPC
 */
export const trpcThemeStorage = createJSONStorage(() =>
	createTrpcStorageAdapter({
		get: () => electronTrpcClient.uiState.theme.get.query(),
		// biome-ignore lint/suspicious/noExplicitAny: Zustand persist passes unknown, tRPC expects typed input
		set: (input) => electronTrpcClient.uiState.theme.set.mutate(input as any),
	}),
);

/**
 * Zustand storage adapter for hotkeys state using tRPC
 */
export const trpcHotkeysStorage = createJSONStorage(() =>
	createTrpcStorageAdapter({
		get: async () => {
			const hotkeysState = await electronTrpcClient.uiState.hotkeys.get.query();
			return { hotkeysState };
		},
		set: (input) => {
			// Skip persistence when syncing from remote to avoid echo writes
			if (skipNextHotkeysPersist) {
				skipNextHotkeysPersist = false;
				return Promise.resolve();
			}
			const state = input as { hotkeysState: HotkeysState };
			return electronTrpcClient.uiState.hotkeys.set.mutate(state.hotkeysState);
		},
	}),
);

/**
 * Zustand storage adapter for ringtone state using tRPC.
 * Only the selectedRingtoneId is persisted.
 */
export const trpcRingtoneStorage = createJSONStorage(() =>
	createTrpcStorageAdapter({
		get: async () => {
			const ringtoneId =
				await electronTrpcClient.settings.getSelectedRingtoneId.query();
			return { selectedRingtoneId: ringtoneId };
		},
		set: async (input) => {
			const state = input as { selectedRingtoneId: string };
			await electronTrpcClient.settings.setSelectedRingtoneId.mutate({
				ringtoneId: state.selectedRingtoneId,
			});
		},
	}),
);

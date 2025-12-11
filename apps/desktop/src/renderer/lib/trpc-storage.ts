import { createJSONStorage, type StateStorage } from "zustand/middleware";
import { trpcClient } from "./trpc-client";

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
		getItem: async (_name: string): Promise<string | null> => {
			try {
				const state = await config.get();
				if (!state) return null;
				// Wrap in zustand persist format
				return JSON.stringify({ state, version: 0 });
			} catch (error) {
				console.error("[trpc-storage] Failed to get state:", error);
				return null;
			}
		},
		setItem: async (_name: string, value: string): Promise<void> => {
			try {
				const parsed = JSON.parse(value) as { state: unknown; version: number };
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
		get: () => trpcClient.uiState.tabs.get.query(),
		// biome-ignore lint/suspicious/noExplicitAny: Zustand persist passes unknown, tRPC expects typed input
		set: (input) => trpcClient.uiState.tabs.set.mutate(input as any),
	}),
);

/**
 * Zustand storage adapter for theme state using tRPC
 */
export const trpcThemeStorage = createJSONStorage(() =>
	createTrpcStorageAdapter({
		get: () => trpcClient.uiState.theme.get.query(),
		// biome-ignore lint/suspicious/noExplicitAny: Zustand persist passes unknown, tRPC expects typed input
		set: (input) => trpcClient.uiState.theme.set.mutate(input as any),
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
				await trpcClient.settings.getSelectedRingtoneId.query();
			return { selectedRingtoneId: ringtoneId };
		},
		set: async (input) => {
			const state = input as { selectedRingtoneId: string };
			await trpcClient.settings.setSelectedRingtoneId.mutate({
				ringtoneId: state.selectedRingtoneId,
			});
		},
	}),
);

import { isApplyingRemoteTabsState } from "renderer/stores/tabs/remote-apply";
import { createJSONStorage } from "zustand/middleware";
import { electronTrpcClient } from "./trpc-client";
import { createTrpcStorageAdapter } from "./trpc-storage-adapter";

/**
 * Zustand storage adapter for tabs state using tRPC
 */
export const trpcTabsStorage = createJSONStorage(() =>
	createTrpcStorageAdapter({
		get: () => electronTrpcClient.uiState.tabs.get.query(),
		// biome-ignore lint/suspicious/noExplicitAny: Zustand persist passes unknown, tRPC expects typed input
		set: (input) => electronTrpcClient.uiState.tabs.set.mutate(input as any),
		writeDebounceMs: 300,
		shouldSuppressWrite: isApplyingRemoteTabsState,
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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "chat.selectedModelId";

// Module-level store rather than component state: several composers can be
// mounted across sessions, and they must all agree on the current preference.
let selectedModelId: string | undefined;
let hydrated = false;
const listeners = new Set<() => void>();

const emit = () => {
	for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

const getSnapshot = () => selectedModelId;

/**
 * The user's model preference, mirroring desktop's `chatPreferences.selectedModelId`
 * (`ChatPaneInterface.tsx`): persisted across launches and sent with **every**
 * message as `metadata.model`, which makes the host `switchModel` before the turn.
 *
 * Until the user picks something there is no preference at all, and the composer
 * falls back to the catalog default — again matching desktop. The host does not
 * report which model a session is on, so a pick made on another client is not
 * reflected here.
 */
export function useSelectedModel(): [string | undefined, (id: string) => void] {
	const modelId = useSyncExternalStore(subscribe, getSnapshot);

	// Read-through hydration, once per app launch. Until it lands the chip shows
	// the host's model, which is a truthful thing to show rather than a flash of
	// the wrong label.
	useEffect(() => {
		if (hydrated) return;
		hydrated = true;
		void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
			if (stored && !selectedModelId) {
				selectedModelId = stored;
				emit();
			}
		});
	}, []);

	const select = useCallback((next: string) => {
		selectedModelId = next;
		emit();
		void AsyncStorage.setItem(STORAGE_KEY, next);
	}, []);

	return [modelId, select];
}

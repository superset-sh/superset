import * as SecureStore from "expo-secure-store";

// A Live Activity push-to-start wakes the app while the phone is locked, and
// better-auth reads the session from here as its module loads. Keychain items
// default to WHEN_UNLOCKED, which throws in that launch, so the session lives
// in its own service under the class Apple prescribes for background reads.
// Updating an item never changes its class, so the legacy copy is re-added
// here rather than overwritten.
const BACKGROUND_READABLE: SecureStore.SecureStoreOptions = {
	keychainService: "superset-auth",
	keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

export const sessionStorage = {
	getItem(key: string): string | null {
		const value = SecureStore.getItem(key, BACKGROUND_READABLE);
		if (value != null) return value;
		const legacy = SecureStore.getItem(key);
		if (legacy != null) sessionStorage.setItem(key, legacy);
		return legacy;
	},
	setItem(key: string, value: string): void {
		SecureStore.setItem(key, value, BACKGROUND_READABLE);
		void SecureStore.deleteItemAsync(key);
	},
};

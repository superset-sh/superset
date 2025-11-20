/**
 * Global test setup for Bun tests
 * This file mocks the Electron environment for unit tests
 */

// Mock window.electronStore for all tests
const mockStorage = new Map<string, string>();
global.window = {
	electronStore: {
		get: async (key: string) => mockStorage.get(key) || null,
		set: async (key: string, value: string) => {
			mockStorage.set(key, value);
		},
		delete: async (key: string) => {
			mockStorage.delete(key);
		},
	},
} as any;

/**
 * Global test setup for Bun tests
 * This file mocks the Electron environment for unit tests
 */
import { mock } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Set NODE_ENV to test so terminal-history uses tmpdir
process.env.NODE_ENV = "test";

// Use a temporary directory for tests instead of /mock
const testTmpDir = join(tmpdir(), "superset-test");

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

// Mock globalThis.electronTRPC for trpc-electron/renderer
(globalThis as any).electronTRPC = {
	sendMessage: () => {},
	onMessage: () => {},
};

// Mock electron module
mock.module("electron", () => ({
	app: {
		getPath: mock(() => testTmpDir),
		getName: mock(() => "test-app"),
		getVersion: mock(() => "1.0.0"),
	},
	dialog: {
		showOpenDialog: mock(() =>
			Promise.resolve({ canceled: false, filePaths: [] }),
		),
		showSaveDialog: mock(() =>
			Promise.resolve({ canceled: false, filePath: "" }),
		),
		showMessageBox: mock(() => Promise.resolve({ response: 0 })),
	},
	BrowserWindow: mock(() => ({
		webContents: {
			send: mock(),
		},
		loadURL: mock(),
		on: mock(),
	})),
	ipcMain: {
		handle: mock(),
		on: mock(),
	},
}));

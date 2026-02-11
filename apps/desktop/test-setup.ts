/**
 * Global test setup for Bun tests
 *
 * This file mocks EXTERNAL dependencies only:
 * - Electron APIs (app, dialog, BrowserWindow, ipcMain)
 * - Browser globals (document, window)
 * - trpc-electron renderer requirements
 *
 * DO NOT mock internal code here - tests should use real implementations
 * or mock at the individual test level when necessary.
 */
import { mock } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.NODE_ENV = "test";
process.env.SKIP_ENV_VALIDATION = "1";

const testTmpDir = join(tmpdir(), "superset-test");

// =============================================================================
// Browser Global Mocks (required for renderer code that touches DOM)
// =============================================================================

const mockStyleMap = new Map<string, string>();
const mockClassList = new Set<string>();

const mockHead = {
	appendChild: mock(() => {}),
	removeChild: mock(() => {}),
};

// biome-ignore lint/suspicious/noExplicitAny: Test setup requires extending globalThis
(globalThis as any).document = {
	documentElement: {
		style: {
			setProperty: (key: string, value: string) => mockStyleMap.set(key, value),
			getPropertyValue: (key: string) => mockStyleMap.get(key) || "",
		},
		classList: {
			add: (className: string) => mockClassList.add(className),
			remove: (className: string) => mockClassList.delete(className),
			toggle: (className: string) => {
				mockClassList.has(className)
					? mockClassList.delete(className)
					: mockClassList.add(className);
			},
			contains: (className: string) => mockClassList.has(className),
		},
	},
	head: mockHead,
	getElementsByTagName: mock((tag: string) => {
		if (tag === "head") return [mockHead];
		return [];
	}),
	createElement: mock((_tag: string) => ({
		setAttribute: mock(() => {}),
		appendChild: mock(() => {}),
		textContent: "",
		type: "",
	})),
	createTextNode: mock((text: string) => ({
		textContent: text,
	})),
};

// =============================================================================
// Electron Preload Mocks (exposed via contextBridge in real app)
// =============================================================================

// trpc-electron expects this global for renderer-side communication
// biome-ignore lint/suspicious/noExplicitAny: Test setup requires extending globalThis
(globalThis as any).electronTRPC = {
	sendMessage: () => {},
	onMessage: (_callback: (msg: unknown) => void) => {},
};

// =============================================================================
// Electron Module Mock (the actual electron package)
// =============================================================================

mock.module("electron", () => ({
	app: {
		getPath: mock(() => testTmpDir),
		getName: mock(() => "test-app"),
		getVersion: mock(() => "1.0.0"),
		getAppPath: mock(() => testTmpDir),
		isPackaged: false,
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
		webContents: { send: mock() },
		loadURL: mock(),
		on: mock(),
	})),
	ipcMain: {
		handle: mock(),
		on: mock(),
	},
	shell: {
		openExternal: mock(() => Promise.resolve()),
		openPath: mock(() => Promise.resolve("")),
	},
	clipboard: {
		writeText: mock(),
		readText: mock(() => ""),
	},
	screen: {
		getPrimaryDisplay: mock(() => ({
			workAreaSize: { width: 1920, height: 1080 },
			bounds: { x: 0, y: 0, width: 1920, height: 1080 },
		})),
		getAllDisplays: mock(() => [
			{
				bounds: { x: 0, y: 0, width: 1920, height: 1080 },
				workAreaSize: { width: 1920, height: 1080 },
			},
		]),
	},
	Notification: mock(() => ({
		show: mock(),
		on: mock(),
	})),
	Menu: {
		buildFromTemplate: mock(() => ({})),
		setApplicationMenu: mock(),
	},
}));

// =============================================================================
// Analytics Mock (has Electron/API dependencies)
// =============================================================================

mock.module("main/lib/analytics", () => ({
	track: mock(() => {}),
	clearUserCache: mock(() => {}),
	shutdown: mock(() => Promise.resolve()),
}));

// =============================================================================
// Local DB Mock (better-sqlite3 not supported in Bun tests)
// =============================================================================

mock.module("main/lib/local-db", () => ({
	localDb: {
		select: mock(() => ({
			from: mock(() => ({
				where: mock(() => ({
					get: mock(() => null),
					all: mock(() => []),
				})),
				get: mock(() => null),
				all: mock(() => []),
			})),
		})),
		insert: mock(() => ({
			values: mock(() => ({
				returning: mock(() => ({
					get: mock(() => ({ id: "test-id" })),
				})),
				onConflictDoUpdate: mock(() => ({
					run: mock(),
				})),
				run: mock(),
			})),
		})),
		update: mock(() => ({
			set: mock(() => ({
				where: mock(() => ({
					run: mock(),
					returning: mock(() => ({
						get: mock(() => ({ id: "test-id" })),
					})),
				})),
			})),
		})),
		delete: mock(() => ({
			where: mock(() => ({
				run: mock(),
			})),
		})),
	},
}));

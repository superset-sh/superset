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
// drizzle-orm Mocks (fallback so @superset/local-db can load if mock.module
// fails to intercept the workspace package on Linux CI)
// =============================================================================

// biome-ignore lint/suspicious/noExplicitAny: Mock setup
const mockColumn = (name: string): any => ({
	name,
	notNull: () => mockColumn(name),
	primaryKey: () => mockColumn(name),
	unique: () => mockColumn(name),
	default: () => mockColumn(name),
	references: () => mockColumn(name),
	$defaultFn: () => mockColumn(name),
	$type: () => mockColumn(name),
});

// biome-ignore lint/suspicious/noExplicitAny: Mock setup
const mockSqliteTable = (tableName: string, columns: Record<string, any>) => {
	const table = { ...columns };
	for (const [key, col] of Object.entries(columns)) {
		table[key] = { ...col, name: key, tableName };
	}
	return table;
};

mock.module("drizzle-orm/sqlite-core", () => ({
	sqliteTable: mockSqliteTable,
	text: (name: string) => mockColumn(name),
	integer: (name: string) => mockColumn(name),
	index: (name: string) => ({
		on: () => ({ name }),
	}),
}));

mock.module("drizzle-orm", () => ({
	relations: () => ({}),
	eq: () => true,
	and: () => true,
	or: () => true,
	sql: () => "",
}));

// =============================================================================
// @superset/local-db Schema Mock (primary mock for the workspace package)
// =============================================================================

const mockTable = (name: string) => ({ id: `${name}_id` });

const localDbMock = () => ({
	projects: mockTable("projects"),
	workspaces: mockTable("workspaces"),
	worktrees: mockTable("worktrees"),
	settings: mockTable("settings"),
	users: mockTable("users"),
	organizations: mockTable("organizations"),
	organizationMembers: mockTable("organization_members"),
	tasks: mockTable("tasks"),
	EXTERNAL_APPS: [],
	EXECUTION_MODES: ["sequential", "parallel"],
	BRANCH_PREFIX_MODES: ["none", "github", "author", "custom"],
	TERMINAL_LINK_BEHAVIORS: ["external-editor", "file-viewer"],
	FILE_OPEN_MODES: ["split-pane", "new-tab"],
});

// Mock both the package name and the resolved source path to handle
// bun's workspace package resolution in different versions.
mock.module("@superset/local-db", localDbMock);
mock.module("@superset/local-db/schema", localDbMock);

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

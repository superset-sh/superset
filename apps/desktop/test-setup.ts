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
import "../../scripts/test-preload.ts";
import { beforeEach, mock } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

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
	addEventListener: mock(() => {}),
	removeEventListener: mock(() => {}),
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

// zustand's persist middleware defaults to `window.localStorage`. The
// xterm-env-polyfill preload aliases `window` to globalThis, so that lookup
// resolves to `undefined` without throwing and persist crashes on the first
// setState. Provide an in-memory Storage so persisted stores work in tests.
const localStorageData = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
	get length() {
		return localStorageData.size;
	},
	clear: () => localStorageData.clear(),
	getItem: (key: string) => localStorageData.get(key) ?? null,
	key: (index: number) => [...localStorageData.keys()][index] ?? null,
	removeItem: (key: string) => {
		localStorageData.delete(key);
	},
	setItem: (key: string, value: string) => {
		localStorageData.set(key, value);
	},
};

beforeEach(() => {
	localStorageData.clear();
});

// Ensure window has addEventListener/removeEventListener for react-hotkeys-hook's IIFE
if (typeof globalThis.window !== "undefined") {
	const win = globalThis.window as Record<string, unknown>;
	if (!win.addEventListener) win.addEventListener = mock(() => {});
	if (!win.removeEventListener) win.removeEventListener = mock(() => {});
} else {
	// biome-ignore lint/suspicious/noExplicitAny: Test setup requires extending globalThis
	(globalThis as any).window = {
		addEventListener: mock(() => {}),
		removeEventListener: mock(() => {}),
	};
}

// localStorage: renderer stores persisted with zustand's `persist` middleware
// write to it on every setState, and zustand resolves the storage once at
// module load. Install a working mock unconditionally (some environments expose
// a present-but-nonfunctional `localStorage`, so a `typeof === "undefined"`
// guard is not enough) and before any store module is imported.
const localStorageBacking = new Map<string, string>();
const mockLocalStorage: Storage = {
	get length() {
		return localStorageBacking.size;
	},
	clear: () => localStorageBacking.clear(),
	getItem: (key: string) => localStorageBacking.get(key) ?? null,
	key: (index: number) => Array.from(localStorageBacking.keys())[index] ?? null,
	removeItem: (key: string) => {
		localStorageBacking.delete(key);
	},
	setItem: (key: string, value: string) => {
		localStorageBacking.set(key, String(value));
	},
};
Object.defineProperty(globalThis, "localStorage", {
	value: mockLocalStorage,
	writable: true,
	configurable: true,
});

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
	webContents: {
		fromId: mock(() => null),
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
	getPosthogClient: mock(() => null),
	getUserId: mock(() => null),
	setUserId: mock(() => {}),
}));

// =============================================================================
// @superset/local-db Schema Mock (drizzle-orm/sqlite-core not available in Bun tests)
// =============================================================================

const mockTable = (name: string) => ({ id: `${name}_id` });

const agentPresetOverrideSchema = z.object({
	id: z.string(),
	enabled: z.boolean().optional(),
	label: z.string().optional(),
	description: z.string().nullable().optional(),
	command: z.string().optional(),
	promptCommand: z.string().optional(),
	promptCommandSuffix: z.string().nullable().optional(),
	taskPromptTemplate: z.string().optional(),
	contextPromptTemplateSystem: z.string().optional(),
	contextPromptTemplateUser: z.string().optional(),
	model: z.string().optional(),
});

const agentPresetOverrideEnvelopeSchema = z.object({
	version: z.literal(1),
	presets: z.array(agentPresetOverrideSchema),
});

const agentCustomDefinitionSchema = z.object({
	id: z.string().regex(/^custom:/),
	kind: z.literal("terminal"),
	label: z.string(),
	description: z.string().optional(),
	command: z.string(),
	promptCommand: z.string().optional(),
	promptCommandSuffix: z.string().optional(),
	promptTransport: z.enum(["argv", "stdin"]).optional(),
	taskPromptTemplate: z.string(),
	contextPromptTemplateSystem: z.string().optional(),
	contextPromptTemplateUser: z.string().optional(),
	enabled: z.boolean().optional(),
});

const localDbMock = () => ({
	projects: mockTable("projects"),
	workspaces: mockTable("workspaces"),
	worktrees: mockTable("worktrees"),
	settings: mockTable("settings"),
	users: mockTable("users"),
	organizations: mockTable("organizations"),
	organizationMembers: mockTable("organization_members"),
	tasks: mockTable("tasks"),
	workspaceSections: mockTable("workspace_sections"),
	agentPresetOverrideSchema,
	agentPresetOverrideEnvelopeSchema,
	agentCustomDefinitionSchema,
	PROMPT_TRANSPORTS: ["argv", "stdin"],
	EXTERNAL_APPS: [],
	EXECUTION_MODES: [
		"split-pane",
		"new-tab",
		"new-tab-split-pane",
		"sequential",
	],
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

// =============================================================================
// Lingui Macro Mock (macros are compile-time; bun test runs uncompiled source,
// and the runtime @lingui/*/macro entries require babel-plugin-macros)
// =============================================================================

type MessageDescriptor = {
	id: string;
	message?: string;
	values?: Record<string, unknown>;
};

const renderMessage = (descriptor: MessageDescriptor): string => {
	let text = descriptor.message ?? descriptor.id;
	for (const [key, value] of Object.entries(descriptor.values ?? {})) {
		text = text.replaceAll(`{${key}}`, String(value));
	}
	return text;
};

const pickPluralBranch = (
	value: number,
	branches: Record<string, unknown>,
): unknown => {
	const branch =
		value === 1 && branches.one !== undefined ? branches.one : branches.other;
	return typeof branch === "string"
		? branch.replaceAll("#", String(value))
		: branch;
};

mock.module("@lingui/react/macro", () => ({
	Trans: ({ children }: { children?: unknown }) => children,
	Plural: ({ value, ...branches }: { value: number }) =>
		pickPluralBranch(value, branches),
	Select: ({ value, ...branches }: { value: string }) =>
		(branches as Record<string, unknown>)[value] ??
		(branches as Record<string, unknown>).other,
	SelectOrdinal: ({ value, ...branches }: { value: number }) =>
		pickPluralBranch(value, branches),
	useLingui: () => ({
		t: (descriptor: MessageDescriptor) => renderMessage(descriptor),
		i18n: { _: (descriptor: MessageDescriptor) => renderMessage(descriptor) },
	}),
}));

mock.module("@lingui/core/macro", () => ({
	msg: (descriptor: MessageDescriptor) => descriptor,
	t: (descriptor: MessageDescriptor) => renderMessage(descriptor),
	plural: (value: number, branches: Record<string, string>) =>
		String(pickPluralBranch(value, branches)),
}));

// The compiled macro turns `message: `${minutes}m`` into "{minutes}m" plus
// matching `values`, so the catalog stores placeholders. The shim above runs
// on uncompiled source, where the template is already interpolated and no
// values exist — a real `i18n._` would then find the catalog's placeholder
// message and render it empty. Resolve descriptors from their own message in
// tests so assertions see the English defaults.
const realI18nModule = await import("@superset/i18n");
// Proxy rather than spread: `i18n` is a class instance, so `load`/`activate`
// live on the prototype and a spread would drop them.
const testI18n = new Proxy(realI18nModule.i18n, {
	get(target, prop, receiver) {
		if (prop === "_") {
			return (
				descriptor: MessageDescriptor | string,
				values?: Record<string, unknown>,
			) =>
				typeof descriptor === "string"
					? descriptor
					: renderMessage({
							...descriptor,
							values: values ?? descriptor.values,
						});
		}
		const value = Reflect.get(target, prop, receiver);
		return typeof value === "function" ? value.bind(target) : value;
	},
});
mock.module("@superset/i18n", () => ({ ...realI18nModule, i18n: testI18n }));

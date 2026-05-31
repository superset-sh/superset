import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../db";
import * as schema from "../../db/schema";
import { encodeProviderModelRef } from "../../model-providers/model-ref";
import { upsertModelProvider } from "../../model-providers/storage";
import { RegistryModelProvider } from "../../providers/model-providers";
import type { ModelProviderRuntimeResolver } from "../../providers/model-providers/types";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../drizzle");
const SESSION_ID = "session-1";
const WORKSPACE_ID = "workspace-1";
const ENV_KEYS = [
	"HOME",
	"APPDATA",
	"XDG_DATA_HOME",
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"ANTHROPIC_BASE_URL",
	"OPENAI_API_KEY",
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

interface TestMemoryStore {
	getThreadById(args: { threadId: string }): Promise<{
		id: string;
		resourceId: string;
		title?: string;
	} | null>;
	listMessages(args: {
		threadId: string;
		perPage: false;
		orderBy: { field: "createdAt"; direction: "ASC" };
	}): Promise<{ messages: Array<{ id: string; role: string }> }>;
	cloneThread(args: {
		sourceThreadId: string;
		resourceId?: string;
		title?: string;
		options?: {
			messageFilter?: {
				messageIds?: string[];
			};
		};
	}): Promise<{
		thread: {
			id: string;
			resourceId: string;
			title?: string;
		};
	}>;
}

const harnessInitMock = mock(async () => {});
const harnessSetResourceIdMock = mock((_input: { resourceId: string }) => {});
const harnessSelectOrCreateThreadMock = mock(async () => {});
const harnessSubscribeMock = mock(
	(_listener: (event: unknown) => void) => () => {},
);
const harnessSwitchModelMock = mock(async (_input: unknown) => {});
const harnessSendMessageMock = mock(async (_payload: unknown) => ({
	messageId: "message-1",
}));
const harnessGetCurrentThreadIdMock = mock(() => "thread-1");
const harnessAbortMock = mock(() => {});
const harnessSwitchThreadMock = mock(
	async (_input: { threadId: string }) => {},
);
const harnessSetStateMock = mock(async (_input: unknown) => {});
let activeMemoryStore: TestMemoryStore | null = null;
const harnessGetStoreMock = mock(
	async (_domain: "memory") => activeMemoryStore,
);
const createMastraCodeHomes: Array<string | undefined> = [];
const createMastraCodeConfigs: unknown[] = [];
const createMastraCodeMock = mock(async (config: unknown) => {
	createMastraCodeHomes.push(process.env.HOME);
	createMastraCodeConfigs.push(config);
	return {
		harness: {
			init: harnessInitMock,
			setResourceId: harnessSetResourceIdMock,
			selectOrCreateThread: harnessSelectOrCreateThreadMock,
			subscribe: harnessSubscribeMock,
			switchModel: harnessSwitchModelMock,
			sendMessage: harnessSendMessageMock,
			getCurrentThreadId: harnessGetCurrentThreadIdMock,
			abort: harnessAbortMock,
			switchThread: harnessSwitchThreadMock,
			setState: harnessSetStateMock,
			config: {
				storage: {
					getStore: harnessGetStoreMock,
				},
			},
		},
		mcpManager: null,
		hookManager: {
			setSessionId: mock((_sessionId: string) => {}),
		},
	};
});

mock.module("mastracode", () => ({
	createMastraCode: createMastraCodeMock,
}));

const { ChatRuntimeManager } = await import("./chat");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

function snapshotEnv(): Partial<Record<EnvKey, string | undefined>> {
	return Object.fromEntries(
		ENV_KEYS.map((key) => [key, process.env[key]]),
	) as Partial<Record<EnvKey, string | undefined>>;
}

function restoreEnv(
	snapshot: Partial<Record<EnvKey, string | undefined>>,
): void {
	for (const key of ENV_KEYS) {
		const value = snapshot[key];
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

function seedWorkspace(db: HostDb, workspacePath: string): void {
	db.insert(schema.projects)
		.values({ id: "project-1", repoPath: workspacePath })
		.run();
	db.insert(schema.workspaces)
		.values({
			id: WORKSPACE_ID,
			projectId: "project-1",
			worktreePath: workspacePath,
			branch: "main",
		})
		.run();
}

describe("ChatRuntimeManager model provider integration", () => {
	let envSnapshot: Partial<Record<EnvKey, string | undefined>>;
	let tempRoot: string | null = null;

	beforeEach(() => {
		envSnapshot = snapshotEnv();
		tempRoot = mkdtempSync(join(tmpdir(), "superset-chat-runtime-"));
		process.env.HOME = tempRoot;
		for (const key of ENV_KEYS) {
			if (key !== "HOME") delete process.env[key];
		}
		harnessInitMock.mockClear();
		harnessSetResourceIdMock.mockClear();
		harnessSelectOrCreateThreadMock.mockClear();
		harnessSubscribeMock.mockClear();
		harnessSwitchModelMock.mockClear();
		harnessSendMessageMock.mockClear();
		harnessGetCurrentThreadIdMock.mockClear();
		harnessAbortMock.mockClear();
		harnessSwitchThreadMock.mockClear();
		harnessSetStateMock.mockClear();
		harnessGetStoreMock.mockClear();
		createMastraCodeMock.mockClear();
		createMastraCodeHomes.length = 0;
		createMastraCodeConfigs.length = 0;
		activeMemoryStore = null;
	});

	afterEach(() => {
		if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
		tempRoot = null;
		restoreEnv(envSnapshot);
	});

	it("routes provider-backed Chat sends through the local Anthropic gateway", async () => {
		const db = createTestDb();
		const root = tempRoot ?? tmpdir();
		const workspacePath = join(root, "worktree");
		seedWorkspace(db, workspacePath);
		const provider = upsertModelProvider(db, {
			name: "E2E Gateway",
			protocol: "openai-chat",
			baseUrl: "http://provider.test/v1",
			enabled: true,
			secret: "provider-secret",
			models: [{ modelId: "gpt-5.5" }],
		});
		const fallback: ModelProviderRuntimeResolver = {
			hasUsableRuntimeEnv: mock(async () => false),
			prepareRuntimeEnv: mock(async () => {
				throw new Error("fallback should not be used for provider refs");
			}),
		};
		const mastraHomeDir = join(root, "host", "mastracode");
		const globalAuthPath = join(
			root,
			"Library",
			"Application Support",
			"mastracode",
			"auth.json",
		);
		mkdirSync(dirname(globalAuthPath), { recursive: true });
		writeFileSync(
			globalAuthPath,
			JSON.stringify({
				"apikey:anthropic": { type: "api_key", key: "wrong-global-key" },
			}),
		);
		const manager = new ChatRuntimeManager({
			db,
			mastraHomeDir,
			runtimeResolver: new RegistryModelProvider({
				db,
				fallback,
				gatewayBaseUrl: "http://127.0.0.1:4879/model-gateway",
				internalToken: "gateway-token",
			}),
		});
		const providerModelRef = encodeProviderModelRef({
			providerId: provider.id,
			modelId: "gpt-5.5",
		});

		await manager.sendMessage({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
			payload: { content: "hello" },
			metadata: { model: providerModelRef },
		});

		expect(process.env.ANTHROPIC_API_KEY).toBe("gateway-token");
		expect(process.env.ANTHROPIC_AUTH_TOKEN).toBe("gateway-token");
		expect(process.env.ANTHROPIC_BASE_URL).toBe(
			"http://127.0.0.1:4879/model-gateway",
		);
		expect(process.env.HOME).toBe(root);
		expect(createMastraCodeHomes).toEqual([mastraHomeDir]);
		expect(
			(createMastraCodeConfigs[0] as { settingsPath?: string }).settingsPath,
		).toBe(join(mastraHomeDir, "settings.json"));
		expect(harnessSwitchModelMock).toHaveBeenCalledWith({
			modelId: providerModelRef,
			scope: "thread",
		});
		expect(harnessSendMessageMock).toHaveBeenCalledWith({ content: "hello" });
	});

	it("restarts from persisted Mastra signal messages", async () => {
		const db = createTestDb();
		const root = tempRoot ?? tmpdir();
		const workspacePath = join(root, "worktree");
		seedWorkspace(db, workspacePath);
		const cloneThreadInputs: Array<Record<string, unknown>> = [];
		activeMemoryStore = {
			getThreadById: async () => ({
				id: "thread-1",
				resourceId: "resource-1",
				title: "Existing Thread",
			}),
			listMessages: async () => ({
				messages: [
					{ id: "signal-1", role: "signal" },
					{ id: "assistant-1", role: "assistant" },
					{ id: "signal-2", role: "signal" },
					{ id: "assistant-2", role: "assistant" },
				],
			}),
			cloneThread: async (input) => {
				cloneThreadInputs.push(input);
				return {
					thread: {
						id: "thread-2",
						resourceId: "resource-1",
						title: "Existing Thread",
					},
				};
			},
		};
		const runtimeResolver: ModelProviderRuntimeResolver = {
			hasUsableRuntimeEnv: mock(async () => true),
			prepareRuntimeEnv: mock(async () => {}),
		};
		const manager = new ChatRuntimeManager({
			db,
			runtimeResolver,
		});

		await manager.restartFromMessage({
			sessionId: SESSION_ID,
			workspaceId: WORKSPACE_ID,
			messageId: "signal-2",
			payload: { content: "Retry previous user prompt" },
		});

		expect(cloneThreadInputs).toEqual([
			{
				sourceThreadId: "thread-1",
				resourceId: "resource-1",
				title: "Existing Thread",
				options: {
					messageFilter: {
						messageIds: ["signal-1", "assistant-1"],
					},
				},
			},
		]);
		expect(harnessAbortMock).toHaveBeenCalledTimes(1);
		expect(harnessSwitchThreadMock).toHaveBeenCalledWith({
			threadId: "thread-2",
		});
		expect(harnessSendMessageMock).toHaveBeenCalledWith({
			content: "Retry previous user prompt",
		});
	});
});

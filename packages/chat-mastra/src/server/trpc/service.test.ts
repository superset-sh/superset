import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeSession } from "./utils/runtime";

type Credential =
	| { type: "api_key"; key: string }
	| { type: "oauth"; access: string; expires: number; refresh?: string };

type FakeAuthStorage = {
	reload: ReturnType<typeof mock<() => void>>;
	get: ReturnType<typeof mock<(providerId: string) => Credential | undefined>>;
	set: ReturnType<
		typeof mock<(providerId: string, credential: Credential) => void>
	>;
	remove: ReturnType<typeof mock<(providerId: string) => void>>;
	clear: () => void;
};

function createFakeAuthStorage(): FakeAuthStorage {
	const credentials = new Map<string, Credential>();
	return {
		reload: mock(() => {}),
		get: mock((providerId: string) => credentials.get(providerId)),
		set: mock((providerId: string, credential: Credential) => {
			credentials.set(providerId, credential);
		}),
		remove: mock((providerId: string) => {
			credentials.delete(providerId);
		}),
		clear: () => {
			credentials.clear();
		},
	};
}

const fakeAuthStorage = createFakeAuthStorage();
const createAuthStorageMock = mock(() => fakeAuthStorage);
const createMastraCodeMock = mock(async () => {
	throw new Error("createMastraCode should not be called in this test");
});

mock.module("mastracode", () => ({
	createAuthStorage: createAuthStorageMock,
	createMastraCode: createMastraCodeMock,
}));

const { ChatMastraService } = await import("./service");
const { setAnthropicEnvConfig } = await import("@superset/chat/host");

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const CWD = "/tmp/project";
const MANAGED_ANTHROPIC_ENV_KEYS = [
	"ANTHROPIC_BASE_URL",
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
] as const;
const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const originalAnthropicEnvValues = Object.fromEntries(
	MANAGED_ANTHROPIC_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof MANAGED_ANTHROPIC_ENV_KEYS)[number], string | undefined>;
let testSupersetHomeDir: string | null = null;

function createRuntime(): RuntimeSession {
	return {
		sessionId: SESSION_ID,
		cwd: CWD,
		harness: {
			abort: mock(() => {}),
			respondToToolApproval: mock(async (payload: unknown) => payload),
			respondToQuestion: mock(async (payload: unknown) => payload),
			respondToPlanApproval: mock(async (payload: unknown) => payload),
		} as unknown as RuntimeSession["harness"],
		mcpManager: null as RuntimeSession["mcpManager"],
		hookManager: null as RuntimeSession["hookManager"],
		mcpManualStatuses: new Map(),
		lastErrorMessage: null,
		pendingSandboxQuestion: {
			questionId: "sandbox-1",
			path: "/tmp/secret",
			reason: "Need access",
		},
	};
}

function createServiceHarness() {
	const runtime = createRuntime();
	const service = new ChatMastraService({
		headers: async () => ({}),
		apiUrl: "http://localhost:3000",
	});
	const getOrCreateRuntime = mock(
		async (_sessionId: string, _cwd?: string) => runtime,
	);

	(
		service as unknown as {
			getOrCreateRuntime: typeof getOrCreateRuntime;
		}
	).getOrCreateRuntime = getOrCreateRuntime;

	const caller = service.createRouter().createCaller({});

	return {
		caller,
		getOrCreateRuntime,
		runtime,
		abort: runtime.harness.abort as ReturnType<typeof mock>,
		respondToToolApproval: runtime.harness.respondToToolApproval as ReturnType<
			typeof mock
		>,
		respondToQuestion: runtime.harness.respondToQuestion as ReturnType<
			typeof mock
		>,
		respondToPlanApproval: runtime.harness.respondToPlanApproval as ReturnType<
			typeof mock
		>,
	};
}

beforeEach(() => {
	createAuthStorageMock.mockClear();
	createMastraCodeMock.mockClear();
	fakeAuthStorage.clear();
	fakeAuthStorage.reload.mockClear();
	fakeAuthStorage.get.mockClear();
	fakeAuthStorage.set.mockClear();
	fakeAuthStorage.remove.mockClear();
	testSupersetHomeDir = mkdtempSync(join(tmpdir(), "chat-mastra-test-"));
	process.env.SUPERSET_HOME_DIR = testSupersetHomeDir;
	for (const key of MANAGED_ANTHROPIC_ENV_KEYS) {
		delete process.env[key];
	}
});

afterEach(() => {
	if (testSupersetHomeDir) {
		rmSync(testSupersetHomeDir, { recursive: true, force: true });
		testSupersetHomeDir = null;
	}
	if (originalSupersetHomeDir) {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	} else {
		delete process.env.SUPERSET_HOME_DIR;
	}
	for (const key of MANAGED_ANTHROPIC_ENV_KEYS) {
		const value = originalAnthropicEnvValues[key];
		if (value !== undefined) {
			process.env[key] = value;
		} else {
			delete process.env[key];
		}
	}
});

describe("ChatMastraService control mutations", () => {
	it("hydrates persisted Anthropic gateway env config into Mastra auth", async () => {
		setAnthropicEnvConfig({
			envText: [
				'export ANTHROPIC_API_KEY="sk-ant-api03-local-placeholder"',
				'export ANTHROPIC_BASE_URL="http://localhost:29576/vertex/claude"',
			].join("\n"),
		});

		new ChatMastraService({
			headers: async () => ({}),
			apiUrl: "http://localhost:3000",
		});

		expect(process.env.ANTHROPIC_API_KEY).toBe(
			"sk-ant-api03-local-placeholder",
		);
		expect(process.env.ANTHROPIC_BASE_URL).toBe(
			"http://localhost:29576/vertex/claude",
		);
		expect(fakeAuthStorage.set).toHaveBeenCalledWith("anthropic", {
			type: "api_key",
			key: "sk-ant-api03-local-placeholder",
		});
	});

	it("passes cwd through stop and abort mutations", async () => {
		const { caller, getOrCreateRuntime, abort } = createServiceHarness();

		await caller.session.stop({ sessionId: SESSION_ID, cwd: CWD });
		await caller.session.abort({ sessionId: SESSION_ID, cwd: CWD });

		expect(getOrCreateRuntime).toHaveBeenNthCalledWith(1, SESSION_ID, CWD);
		expect(getOrCreateRuntime).toHaveBeenNthCalledWith(2, SESSION_ID, CWD);
		expect(abort).toHaveBeenCalledTimes(2);
	});

	it("passes cwd through approval, question, and plan responses", async () => {
		const {
			caller,
			getOrCreateRuntime,
			runtime,
			respondToPlanApproval,
			respondToQuestion,
			respondToToolApproval,
		} = createServiceHarness();

		await caller.session.approval.respond({
			sessionId: SESSION_ID,
			cwd: CWD,
			payload: { decision: "approve" },
		});
		await caller.session.question.respond({
			sessionId: SESSION_ID,
			cwd: CWD,
			payload: { questionId: "sandbox-1", answer: "Yes" },
		});
		await caller.session.plan.respond({
			sessionId: SESSION_ID,
			cwd: CWD,
			payload: {
				planId: "plan-1",
				response: { action: "approved", feedback: "ship it" },
			},
		});

		expect(getOrCreateRuntime).toHaveBeenNthCalledWith(1, SESSION_ID, CWD);
		expect(getOrCreateRuntime).toHaveBeenNthCalledWith(2, SESSION_ID, CWD);
		expect(getOrCreateRuntime).toHaveBeenNthCalledWith(3, SESSION_ID, CWD);
		expect(respondToToolApproval).toHaveBeenCalledWith({
			decision: "approve",
		});
		expect(respondToQuestion).toHaveBeenCalledWith({
			questionId: "sandbox-1",
			answer: "Yes",
		});
		expect(respondToPlanApproval).toHaveBeenCalledWith({
			planId: "plan-1",
			response: { action: "approved", feedback: "ship it" },
		});
		expect(runtime.pendingSandboxQuestion).toBeNull();
	});
});

import { beforeEach, describe, expect, it, mock } from "bun:test";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const THREAD_ID = "thread-1";

const setSessionIdMock = mock((_: string) => {});
const runSessionStartMock = mock(async () => ({
	allowed: true,
	results: [],
	warnings: [],
}));
const harnessSubscribeMock = mock((_: (event: unknown) => void) => () => {});
const harnessInitMock = mock(async () => {});
const harnessSetResourceIdMock = mock((_: { resourceId: string }) => {});
const harnessSelectOrCreateThreadMock = mock(async () => {
	setSessionIdMock(THREAD_ID);
});
const createMastraCodeMock = mock(async () => ({
	harness: {
		init: harnessInitMock,
		setResourceId: harnessSetResourceIdMock,
		selectOrCreateThread: harnessSelectOrCreateThreadMock,
		subscribe: harnessSubscribeMock,
	},
	mcpManager: null,
	hookManager: {
		setSessionId: setSessionIdMock,
		runSessionStart: runSessionStartMock,
	},
}));
const createAuthStorageMock = mock(() => ({
	reload: () => {},
	get: () => undefined,
}));

mock.module("mastracode", () => ({
	createAuthStorage: createAuthStorageMock,
	createMastraCode: createMastraCodeMock,
}));

const { ChatRuntimeService } = await import("./service");

describe("ChatRuntimeService runtime creation", () => {
	beforeEach(() => {
		setSessionIdMock.mockClear();
		runSessionStartMock.mockClear();
		harnessSubscribeMock.mockClear();
		harnessInitMock.mockClear();
		harnessSetResourceIdMock.mockClear();
		harnessSelectOrCreateThreadMock.mockClear();
		createMastraCodeMock.mockClear();
		createAuthStorageMock.mockClear();
	});

	it("reasserts the Superset session id after thread selection", async () => {
		const service = new ChatRuntimeService({
			headers: async () => ({}),
			apiUrl: "http://localhost:3000",
		});

		const runtime = await (
			service as unknown as {
				getOrCreateRuntime: (
					sessionId: string,
					cwd?: string,
				) => Promise<{ sessionId: string }>;
			}
		).getOrCreateRuntime(SESSION_ID, "/tmp/project");

		expect(runtime.sessionId).toBe(SESSION_ID);
		expect(setSessionIdMock.mock.calls.map(([sessionId]) => sessionId)).toEqual(
			[SESSION_ID, THREAD_ID, SESSION_ID],
		);
		expect(runSessionStartMock).toHaveBeenCalledTimes(1);
	});
});

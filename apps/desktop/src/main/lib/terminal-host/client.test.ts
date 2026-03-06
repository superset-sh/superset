import { beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("electron", () => ({
	app: {
		isPackaged: false,
		getAppPath: () => "/tmp/superset-app",
		getVersion: () => "2.0.0",
	},
}));

mock.module("main/lib/app-environment", () => ({
	ensureSupersetHomeDirExists: () => {},
	SUPERSET_HOME_DIR: "/tmp/superset-home",
}));

mock.module("./daemon-registry", () => ({
	getTerminalDaemonRegistry: () => ({
		cleanupStaleDaemons: () => {},
		listActive: () => [],
	}),
}));

const listDrainingGenerationsMock = mock(() => []);
const markGenerationPreferredMock = mock((_generationId: string) => {});
const markGenerationRetiredMock = mock((_generationId: string) => {});

mock.module("./daemon-rollout", () => ({
	getCurrentTerminalGenerationId: () => "v2.0.0",
	getPreferredGenerationId: () => "v2.0.0",
	getTerminalDaemonAppVersion: () => "2.0.0",
	listDrainingGenerations: () => listDrainingGenerationsMock(),
	markGenerationPreferred: (generationId: string) =>
		markGenerationPreferredMock(generationId),
	markGenerationRetired: (generationId: string) =>
		markGenerationRetiredMock(generationId),
}));

const { TerminalHostClient } = await import("./client");

interface FakeGenerationClient {
	createOrAttach: ReturnType<typeof mock>;
	listSessions: ReturnType<typeof mock>;
	tryConnectAndAuthenticate: ReturnType<typeof mock>;
}

function createFakeGenerationClient(): FakeGenerationClient {
	return {
		createOrAttach: mock(async () => {
			throw new Error("createOrAttach not configured");
		}),
		listSessions: mock(async () => ({ sessions: [] })),
		tryConnectAndAuthenticate: mock(async () => true),
	};
}

function createClientHarness() {
	const client = new TerminalHostClient() as unknown as {
		createOrAttach: (request: Record<string, unknown>) => Promise<{
			generationId?: string;
		}>;
		resolveSessionGeneration: (sessionId: string) => Promise<string | null>;
		getCurrentGenerationId: () => string;
		getPreferredGenerationId: () => string;
		getOrCreateGenerationClient: (args: {
			generationId: string;
		}) => FakeGenerationClient;
		sessionGenerationMap: Map<string, string>;
	};
	const generationClients = new Map<string, FakeGenerationClient>();

	client.getCurrentGenerationId = () => "v2.0.0";
	client.getPreferredGenerationId = () => "v2.0.0";
	client.getOrCreateGenerationClient = ({
		generationId,
	}: {
		generationId: string;
	}) => {
		const generationClient = generationClients.get(generationId);
		if (!generationClient) {
			throw new Error(`Missing fake generation client for ${generationId}`);
		}
		return generationClient;
	};

	return { client, generationClients };
}

describe("TerminalHostClient generation routing", () => {
	beforeEach(() => {
		listDrainingGenerationsMock.mockClear();
		listDrainingGenerationsMock.mockImplementation(() => []);
		markGenerationPreferredMock.mockClear();
		markGenerationRetiredMock.mockClear();
	});

	it("routes stale mapped sessions back to the preferred generation", async () => {
		const { client, generationClients } = createClientHarness();
		const legacyClient = createFakeGenerationClient();
		const preferredClient = createFakeGenerationClient();

		legacyClient.listSessions.mockResolvedValue({ sessions: [] });
		preferredClient.createOrAttach.mockResolvedValue({
			isNew: true,
			pid: 1,
			snapshot: {
				snapshotAnsi: "",
				rehydrateSequences: "",
				cwd: null,
				modes: {},
				cols: 80,
				rows: 24,
				scrollbackLines: 0,
			},
			wasRecovered: false,
			generationId: "v2.0.0",
		});

		generationClients.set("legacy", legacyClient);
		generationClients.set("v2.0.0", preferredClient);
		client.resolveSessionGeneration = async () => "legacy";

		const response = await client.createOrAttach({
			sessionId: "pane-1",
			paneId: "pane-1",
			tabId: "tab-1",
			workspaceId: "ws-1",
			cols: 80,
			rows: 24,
		});

		expect(response.generationId).toBe("v2.0.0");
		expect(legacyClient.createOrAttach.mock.calls.length).toBe(0);
		expect(preferredClient.createOrAttach.mock.calls.length).toBe(1);
		expect(client.sessionGenerationMap.get("pane-1")).toBe("v2.0.0");
	});

	it("keeps existing sessions on their draining generation while they still exist", async () => {
		const { client, generationClients } = createClientHarness();
		const legacyClient = createFakeGenerationClient();
		const preferredClient = createFakeGenerationClient();

		legacyClient.listSessions.mockResolvedValue({
			sessions: [
				{
					sessionId: "pane-1",
					isAlive: true,
					generationId: "legacy",
				},
			],
		});
		legacyClient.createOrAttach.mockResolvedValue({
			isNew: false,
			pid: 1,
			snapshot: {
				snapshotAnsi: "",
				rehydrateSequences: "",
				cwd: null,
				modes: {},
				cols: 80,
				rows: 24,
				scrollbackLines: 0,
			},
			wasRecovered: true,
			generationId: "legacy",
		});

		generationClients.set("legacy", legacyClient);
		generationClients.set("v2.0.0", preferredClient);
		client.resolveSessionGeneration = async () => "legacy";

		const response = await client.createOrAttach({
			sessionId: "pane-1",
			paneId: "pane-1",
			tabId: "tab-1",
			workspaceId: "ws-1",
			cols: 80,
			rows: 24,
		});

		expect(response.generationId).toBe("legacy");
		expect(legacyClient.createOrAttach.mock.calls.length).toBe(1);
		expect(preferredClient.createOrAttach.mock.calls.length).toBe(0);
	});

	it("does not fall back to the preferred generation when attaching to an existing draining session fails", async () => {
		const { client, generationClients } = createClientHarness();
		const legacyClient = createFakeGenerationClient();
		const preferredClient = createFakeGenerationClient();

		legacyClient.listSessions.mockResolvedValue({
			sessions: [
				{
					sessionId: "pane-1",
					isAlive: true,
					generationId: "legacy",
				},
			],
		});
		legacyClient.createOrAttach.mockRejectedValue(new Error("Connection lost"));

		generationClients.set("legacy", legacyClient);
		generationClients.set("v2.0.0", preferredClient);
		client.resolveSessionGeneration = async () => "legacy";

		await expect(
			client.createOrAttach({
				sessionId: "pane-1",
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "ws-1",
				cols: 80,
				rows: 24,
			}),
		).rejects.toThrow("Connection lost");
		expect(preferredClient.createOrAttach.mock.calls.length).toBe(0);
	});
});

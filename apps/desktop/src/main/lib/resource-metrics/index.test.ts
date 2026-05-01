import {
	beforeAll,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import type { ProcessSnapshot } from "./process-tree";

// The collector spawns `ps` to build a process tree for live terminal
// sessions. When no sessions are alive there's nothing to measure, so the
// shell-out should be skipped — every `ps` call fans out into the host's EDR
// file-event pipeline and contributes to the loop reported in
// https://github.com/superset-sh/superset/issues/3945.

mock.module("electron", () => ({
	app: {
		getAppMetrics: () => [],
	},
}));

const listSessionsMock = mock(async () => ({ sessions: [] as never[] }));

mock.module("main/lib/workspace-runtime/registry", () => ({
	getWorkspaceRuntimeRegistry: () => ({
		getDefault: () => ({
			terminal: {
				management: {
					listSessions: listSessionsMock,
				},
			},
		}),
	}),
}));

// The global localDb mock in test-setup.ts doesn't model `leftJoin`. Stub
// the chain locally so the workspace-meta lookup in collectResourceMetricsNow
// doesn't throw and pollute test output with caught-error logs.
mock.module("main/lib/local-db", () => {
	const queryChain = {
		from: () => queryChain,
		leftJoin: () => queryChain,
		where: () => queryChain,
		get: () => null,
		all: () => [],
	};
	return {
		localDb: {
			select: () => queryChain,
		},
	};
});

const captureProcessSnapshotMock = mock(
	async (): Promise<ProcessSnapshot> => ({
		byPid: new Map(),
		childrenOf: new Map(),
	}),
);

let collectResourceMetrics: typeof import("./index").collectResourceMetrics;

describe("collectResourceMetrics — process-tree gating", () => {
	beforeAll(async () => {
		// spyOn keeps the rest of the module's exports intact and is scoped to
		// this test file, unlike mock.module which would leak into the sibling
		// process-tree.test.ts run.
		const processTreeModule = await import("./process-tree");
		spyOn(processTreeModule, "captureProcessSnapshot").mockImplementation(() =>
			captureProcessSnapshotMock(),
		);
		({ collectResourceMetrics } = await import("./index"));
	});

	beforeEach(() => {
		captureProcessSnapshotMock.mockClear();
		listSessionsMock.mockClear();
	});

	test("does not spawn `ps` when there are no live terminal sessions", async () => {
		listSessionsMock.mockImplementationOnce(async () => ({ sessions: [] }));

		await collectResourceMetrics({ force: true });

		expect(captureProcessSnapshotMock).not.toHaveBeenCalled();
	});

	test("spawns `ps` only once when live sessions exist", async () => {
		listSessionsMock.mockImplementationOnce(async () => ({
			sessions: [
				{
					sessionId: "s1",
					workspaceId: "w1",
					paneId: "p1",
					isAlive: true,
					attachedClients: 1,
					pid: 12345,
				},
			],
		}));

		await collectResourceMetrics({ force: true });

		expect(captureProcessSnapshotMock).toHaveBeenCalledTimes(1);
	});
});

import { describe, expect, test } from "bun:test";
import type {
	KillRequest,
	ListSessionsResponse,
} from "main/lib/terminal-host/types";
import {
	listLiveV1Sessions,
	stopV1Sessions,
	type V1DaemonClient,
} from "./v1-daemon-sessions";

type DaemonSession = ListSessionsResponse["sessions"][number];

function daemonSession(
	paneId: string,
	overrides: Partial<DaemonSession> = {},
): DaemonSession {
	return {
		sessionId: paneId,
		workspaceId: "ws-1",
		paneId,
		isAlive: true,
		attachedClients: 0,
		pid: 100,
		...overrides,
	};
}

function fakeClient(sessions: DaemonSession[] | null) {
	const killed: KillRequest[] = [];
	const client: V1DaemonClient & {
		killed: KillRequest[];
		running: boolean;
	} = {
		killed,
		running: sessions !== null,
		isDaemonProcessGone: () => !client.running,
		listSessionsIfRunning: async () => (sessions ? { sessions } : null),
		killIfRunning: async (request) => {
			if (!client.running) return false;
			killed.push(request);
			return true;
		},
	};
	return client;
}

describe("listLiveV1Sessions", () => {
	test("is empty when no daemon runs", async () => {
		expect(await listLiveV1Sessions(fakeClient(null))).toEqual([]);
	});

	test("lists only alive sessions", async () => {
		const client = fakeClient([
			daemonSession("pane-1", { pid: 42 }),
			daemonSession("pane-2", { isAlive: false, pid: null }),
		]);
		expect(await listLiveV1Sessions(client)).toEqual([
			{ paneId: "pane-1", workspaceId: "ws-1", isAlive: true, pid: 42 },
		]);
	});
});

describe("a stale socket from a crashed daemon", () => {
	const staleSocket = (daemonAlive: boolean) => {
		const client = fakeClient([]);
		client.running = daemonAlive;
		client.listSessionsIfRunning = async () => {
			throw new Error("probe failed while a socket path was present");
		};
		return client;
	};

	test("counts as no live sessions when the daemon process is gone", async () => {
		expect(await listLiveV1Sessions(staleSocket(false))).toEqual([]);
	});

	test("still fails when the daemon process may be alive", async () => {
		await expect(listLiveV1Sessions(staleSocket(true))).rejects.toThrow();
	});
});

describe("stopV1Sessions", () => {
	test("does nothing when no daemon runs", async () => {
		const client = fakeClient(null);
		expect(await stopV1Sessions(client, ["pane-1"])).toEqual({
			stoppedPaneIds: [],
			failedPaneIds: [],
		});
		expect(client.killed).toEqual([]);
	});

	test("stops only the given alive panes", async () => {
		const client = fakeClient([
			daemonSession("pane-1", { sessionId: "session-1" }),
			daemonSession("pane-2"),
			daemonSession("pane-3", { isAlive: false }),
		]);
		const result = await stopV1Sessions(client, ["pane-1", "pane-3"]);
		expect(client.killed).toEqual([{ sessionId: "session-1" }]);
		expect(result).toEqual({ stoppedPaneIds: ["pane-1"], failedPaneIds: [] });
	});

	test("keeps going when one kill fails", async () => {
		const client = fakeClient([
			daemonSession("pane-1"),
			daemonSession("pane-2"),
		]);
		const kill = client.killIfRunning;
		client.killIfRunning = async (request) => {
			if (request.sessionId === "pane-1") throw new Error("gone");
			return kill(request);
		};
		expect(await stopV1Sessions(client, ["pane-1", "pane-2"])).toEqual({
			stoppedPaneIds: ["pane-2"],
			failedPaneIds: ["pane-1"],
		});
	});

	test("stops nothing more once the daemon exits mid-stop", async () => {
		const client = fakeClient([
			daemonSession("pane-1"),
			daemonSession("pane-2"),
		]);
		client.running = false;
		expect(await stopV1Sessions(client, ["pane-1", "pane-2"])).toEqual({
			stoppedPaneIds: [],
			failedPaneIds: [],
		});
		expect(client.killed).toEqual([]);
	});
});

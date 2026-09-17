import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fakeDb } from "../utils/fake-db";

class Unreachable extends Error {}
type HostResponses = Record<string, unknown | (() => unknown)>;
let hostResponses: HostResponses = {};
const hostCall = mock(
	async (
		_host: unknown,
		procedure: string,
		_method: string,
		_input: unknown,
	) => {
		const response = hostResponses[procedure];
		if (response === undefined) throw new Error(`unexpected ${procedure}`);
		return typeof response === "function" ? response() : response;
	},
);
const postMessage = mock(async (_args: Record<string, unknown>) => ({
	ts: "1",
}));
const schedule = mock(async (_args: { launchId: string; polls: number }) => {});
const findLaunch = mock(async (_args: unknown): Promise<unknown> => launch());
const findSession = mock(async (_args: unknown): Promise<unknown> => session());
const findConnection = mock(
	async (_args: unknown): Promise<unknown> => ({
		accessToken: "xoxb",
	}),
);

const fake = fakeDb({
	query: {
		slackAgentLaunches: { findFirst: findLaunch },
		slackThreadSessions: { findFirst: findSession },
		integrationConnections: { findFirst: findConnection },
	},
});
// bun shares mock.module registrations across test files in one process, so
// pin every module this file relies on rather than inheriting another's.
mock.module("@superset/db/client", () => ({ db: fake.db }));
mock.module("../utils/host-access", () => ({
	hostAccessFor: async (params: {
		organizationId: string;
		hostId: string;
	}) => ({
		relayUrl: "https://relay.test",
		organizationId: params.organizationId,
		hostId: params.hostId,
		jwt: "jwt",
	}),
}));
mock.module("@superset/mcp/host-service-client", () => ({
	hostServiceCall: hostCall,
	HostServiceUnreachableError: Unreachable,
}));
mock.module("@/lib/analytics", () => ({ posthog: { capture: () => {} } }));
// Mocking the barrel writes through its re-exported bindings, so pass the
// real helper rather than a stub that would replace it for every other file.
const { slackRateLimitRetryAfterMs } = await import(
	"../utils/slack-client/request-bounds"
);
mock.module("../utils/slack-client", () => ({
	createSlackClient: () => ({ chat: { postMessage } }),
	isUnpostableChannelError: () => false,
	slackRateLimitRetryAfterMs,
}));
mock.module("../utils/agent-launches", () => ({
	scheduleCompletionCheck: schedule,
	recordAgentLaunches: async () => {},
	hostLaunchesFromActions: () => [],
	completionCheckDelaySeconds: () => 30,
	COMPLETION_JOB_PATH: "/api/integrations/slack/jobs/agent-completion",
}));
const { agentTurnState, processAgentCompletion } = await import(
	"./process-agent-completion"
);

const LAUNCHED_AT = new Date("2026-09-15T10:00:00.000Z");

function launch(overrides: Record<string, unknown> = {}) {
	return {
		id: "launch-1",
		threadSessionId: "thread-1",
		launchedByUserId: "user-1",
		hostId: "host-1",
		workspaceId: "ws-1",
		terminalId: "term-1",
		agentLabel: "Claude",
		workspaceName: "fix-login",
		workspaceBranch: "feat/login",
		polls: 2,
		launchedAt: LAUNCHED_AT,
		completedAt: null,
		outcome: null,
		...overrides,
	};
}

function session(overrides: Record<string, unknown> = {}) {
	return {
		id: "thread-1",
		organizationId: "org-1",
		teamId: "T1",
		channelId: "C1",
		threadTs: "1.0",
		quiet: false,
		quietedAt: null,
		...overrides,
	};
}

const stopped = {
	"terminalAgents.listByWorkspace": [
		{ terminalId: "term-1", lastEventType: "Stop" },
	],
	"terminal.transcript": {
		source: "harness",
		text: "User: fix it\n\nAssistant: Fixed the redirect.\nPR is up.",
	},
	"pullRequests.refreshByWorkspaces": { ok: true },
	"pullRequests.getByWorkspaces": {
		workspaces: [
			{
				workspaceId: "ws-1",
				pullRequest: {
					url: "https://github.com/acme/app/pull/418",
					number: 418,
					title: "Fix login",
					state: "open",
				},
			},
		],
	},
};

const realNow = Date.now;

beforeEach(() => {
	Date.now = () => LAUNCHED_AT.getTime() + 5 * 60_000;
	hostResponses = { ...stopped };
	hostCall.mockClear();
	postMessage.mockClear();
	schedule.mockClear();
	findLaunch.mockReset();
	findLaunch.mockImplementation(async () => launch());
	findSession.mockReset();
	findSession.mockImplementation(async () => session());
	fake.calls.length = 0;
	fake.results.update = [{ id: "launch-1" }];
});

const updatesSetting = (key: string) =>
	fake
		.callsTo("update.set")
		.map((call) => call.args[0] as Record<string, unknown>)
		.filter((values) => key in values);

describe("agentTurnState", () => {
	test("reads a live binding's last event", () => {
		expect(
			agentTurnState({ binding: { terminalId: "t", lastEventType: "Stop" } }),
		).toEqual({ kind: "ended", end: "stopped" });
		expect(
			agentTurnState({
				binding: { terminalId: "t", lastEventType: "Failed" },
			}),
		).toEqual({ kind: "ended", end: "failed" });
		expect(
			agentTurnState({
				binding: { terminalId: "t", lastEventType: "Start" },
			}),
		).toEqual({ kind: "running" });
		expect(
			agentTurnState({
				binding: { terminalId: "t", lastEventType: "Attached" },
			}),
		).toEqual({ kind: "running" });
	});

	test("a binding parked on a permission request ends the watch as waiting", () => {
		expect(
			agentTurnState({
				binding: { terminalId: "t", lastEventType: "PermissionRequest" },
			}),
		).toEqual({ kind: "ended", end: "waiting" });
	});

	test("without a binding, a busy terminal is an agent still booting and anything else has exited", () => {
		const terminal = { terminalId: "t", exited: false };
		expect(agentTurnState({ terminal, processRunning: true })).toEqual({
			kind: "running",
		});
		expect(agentTurnState({ terminal, processRunning: false })).toEqual({
			kind: "ended",
			end: "exited",
		});
		expect(agentTurnState({ terminal: { ...terminal, exited: true } })).toEqual(
			{ kind: "ended", end: "exited" },
		);
		expect(agentTurnState({})).toEqual({ kind: "ended", end: "exited" });
	});
});

describe("processAgentCompletion", () => {
	test("posts one reply with the agent's last line and the PR once its turn ends", async () => {
		await processAgentCompletion({ launchId: "launch-1" });
		expect(postMessage).toHaveBeenCalledTimes(1);
		expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
			channel: "C1",
			thread_ts: "1.0",
			text: "Claude finished in fix-login (feat/login). Fixed the redirect. PR is up. Opened #418 Fix login https://github.com/acme/app/pull/418",
			blocks: [
				{
					type: "markdown",
					text: [
						"**Claude finished** in **fix-login** (`feat/login`).",
						"> Fixed the redirect. PR is up.",
						"Opened [#418 Fix login](https://github.com/acme/app/pull/418)",
					].join("\n"),
				},
			],
		});
		expect(updatesSetting("completedAt")).toHaveLength(1);
		expect(updatesSetting("outcome")).toEqual([{ outcome: "posted" }]);
		expect(schedule).not.toHaveBeenCalled();
	});

	test("a launch that was already handled is not posted again", async () => {
		findLaunch.mockImplementation(async () =>
			launch({ completedAt: new Date(), outcome: "posted" }),
		);
		await processAgentCompletion({ launchId: "launch-1" });
		expect(hostCall).not.toHaveBeenCalled();
		expect(postMessage).not.toHaveBeenCalled();
	});

	test("losing the completed_at claim to a concurrent run posts nothing", async () => {
		fake.results.update = [];
		await processAgentCompletion({ launchId: "launch-1" });
		expect(postMessage).not.toHaveBeenCalled();
		expect(updatesSetting("outcome")).toHaveLength(0);
	});

	test("while the agent is still working it schedules the next look", async () => {
		hostResponses["terminalAgents.listByWorkspace"] = [
			{ terminalId: "term-1", lastEventType: "Start" },
		];
		await processAgentCompletion({ launchId: "launch-1" });
		expect(postMessage).not.toHaveBeenCalled();
		expect(updatesSetting("polls")).toEqual([{ polls: 3 }]);
		expect(schedule).toHaveBeenCalledWith({ launchId: "launch-1", polls: 3 });
	});

	test("an unreachable host is looked at again later", async () => {
		hostResponses["terminalAgents.listByWorkspace"] = () => {
			throw new Unreachable("offline");
		};
		await processAgentCompletion({ launchId: "launch-1" });
		expect(postMessage).not.toHaveBeenCalled();
		expect(schedule).toHaveBeenCalledWith({ launchId: "launch-1", polls: 3 });
	});

	test("an agent that left without a Stop is reported as exited, without a summary", async () => {
		hostResponses["terminalAgents.listByWorkspace"] = [];
		hostResponses["terminal.list"] = { sessions: [] };
		hostResponses["terminal.transcript"] = { source: "stream", text: "$ " };
		hostResponses["pullRequests.getByWorkspaces"] = {
			workspaces: [{ workspaceId: "ws-1", pullRequest: null }],
		};
		await processAgentCompletion({ launchId: "launch-1" });
		expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
			blocks: [
				{
					type: "markdown",
					text: "**Claude exited** in **fix-login** (`feat/login`) before reporting back.",
				},
			],
		});
	});

	test("a thread quieted after the launch hears nothing", async () => {
		findSession.mockImplementation(async () =>
			session({
				quiet: true,
				quietedAt: new Date(LAUNCHED_AT.getTime() + 60_000),
			}),
		);
		await processAgentCompletion({ launchId: "launch-1" });
		expect(postMessage).not.toHaveBeenCalled();
		expect(updatesSetting("outcome")).toEqual([
			expect.objectContaining({ outcome: "quieted" }),
		]);
	});

	test("a thread quieted before the launch still gets the reply it asked for", async () => {
		findSession.mockImplementation(async () =>
			session({
				quiet: true,
				quietedAt: new Date(LAUNCHED_AT.getTime() - 60_000),
			}),
		);
		await processAgentCompletion({ launchId: "launch-1" });
		expect(postMessage).toHaveBeenCalledTimes(1);
	});

	test("a launch older than a day expires without touching the host", async () => {
		Date.now = () => LAUNCHED_AT.getTime() + 25 * 60 * 60_000;
		await processAgentCompletion({ launchId: "launch-1" });
		expect(hostCall).not.toHaveBeenCalled();
		expect(postMessage).not.toHaveBeenCalled();
		expect(updatesSetting("outcome")).toEqual([
			expect.objectContaining({ outcome: "expired" }),
		]);
	});

	test("a failed Slack post is recorded and never retried", async () => {
		postMessage.mockImplementationOnce(async () => {
			throw new Error("channel_not_found");
		});
		await processAgentCompletion({ launchId: "launch-1" });
		expect(updatesSetting("outcome")).toEqual([{ outcome: "post_failed" }]);
	});
});

afterEach(() => {
	Date.now = realNow;
});

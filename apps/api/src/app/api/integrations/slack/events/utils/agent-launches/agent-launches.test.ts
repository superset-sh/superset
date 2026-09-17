import { beforeEach, describe, expect, mock, test } from "bun:test";
import { fakeDb } from "../fake-db";
import type { AgentAction } from "../slack-blocks";

const publishJSON = mock(async (_args: Record<string, unknown>) => ({
	messageId: "m1",
}));
// bun shares mock.module registrations across test files in one process, so
// pin every module this file relies on rather than inheriting another's.
mock.module("@upstash/qstash", () => ({
	Client: class {
		publishJSON = publishJSON;
	},
}));
mock.module("@/env", () => ({
	env: { QSTASH_TOKEN: "qstash", NEXT_PUBLIC_API_URL: "https://api.test" },
}));
const fake = fakeDb();
mock.module("@superset/db/client", () => ({ db: fake.db }));
const {
	completionCheckDelaySeconds,
	hostLaunchesFromActions,
	recordAgentLaunches,
} = await import("./agent-launches");

const launched: AgentAction = {
	type: "agent_launched",
	agents: [
		{
			sessionId: "term-1",
			label: "Claude",
			workspaceId: "ws-1",
			hostId: "host-1",
			workspaceName: "fix-login",
			workspaceBranch: "feat/login",
		},
		{ sessionId: "term-2", label: "Codex", workspaceId: "cloud-ws" },
	],
};

beforeEach(() => {
	publishJSON.mockClear();
	fake.calls.length = 0;
	fake.results.insert = [{ id: "launch-1" }];
	fake.results.select = [];
});

describe("hostLaunchesFromActions", () => {
	test("keeps launches on a host and drops cloud ones and other actions", () => {
		const launches = hostLaunchesFromActions([
			{
				type: "workspace_created",
				workspaces: [{ id: "ws-1", name: "fix-login" }],
			},
			launched,
		]);
		expect(launches).toEqual([
			{
				sessionId: "term-1",
				label: "Claude",
				workspaceId: "ws-1",
				hostId: "host-1",
				workspaceName: "fix-login",
				workspaceBranch: "feat/login",
			},
		]);
	});
});

describe("completionCheckDelaySeconds", () => {
	test("backs off from 30s and settles at five minutes", () => {
		expect([0, 1, 2, 3, 4, 9].map(completionCheckDelaySeconds)).toEqual([
			30, 60, 120, 240, 300, 300,
		]);
	});
});

describe("recordAgentLaunches", () => {
	test("stores the origin of each host launch and schedules its first check", async () => {
		await recordAgentLaunches({
			threadSessionId: "thread-1",
			userId: "user-1",
			actions: [launched],
		});
		const [values] = fake.callsTo("insert.values");
		expect(values?.args[0]).toEqual([
			{
				threadSessionId: "thread-1",
				launchedByUserId: "user-1",
				hostId: "host-1",
				workspaceId: "ws-1",
				terminalId: "term-1",
				agentLabel: "Claude",
				workspaceName: "fix-login",
				workspaceBranch: "feat/login",
			},
		]);
		expect(fake.callsTo("insert.onConflictDoNothing")).toHaveLength(1);
		expect(publishJSON).toHaveBeenCalledTimes(1);
		expect(publishJSON.mock.calls[0]?.[0]).toMatchObject({
			url: "https://api.test/api/integrations/slack/jobs/agent-completion",
			body: { launchId: "launch-1" },
			delay: 30,
			deduplicationId: "slack-agent-launch:launch-1:0",
		});
	});

	test("does nothing without a host launch", async () => {
		await recordAgentLaunches({
			threadSessionId: "thread-1",
			userId: "user-1",
			actions: [
				{
					type: "task_created",
					tasks: [{ id: "t1", slug: "SUP-1", title: "x" }],
				},
			],
		});
		expect(fake.calls).toHaveLength(0);
		expect(publishJSON).not.toHaveBeenCalled();
	});

	test("a launch already recorded for the thread is not scheduled twice", async () => {
		fake.results.insert = [];
		await recordAgentLaunches({
			threadSessionId: "thread-1",
			userId: "user-1",
			actions: [launched],
		});
		expect(publishJSON).not.toHaveBeenCalled();
	});

	test("a launch whose first check never got published is scheduled by the next launch", async () => {
		fake.results.select = [{ id: "orphan-1" }];
		await recordAgentLaunches({
			threadSessionId: "thread-1",
			userId: "user-1",
			actions: [launched],
		});
		expect(publishJSON).toHaveBeenCalledTimes(2);
		expect(publishJSON.mock.calls[1]?.[0]).toMatchObject({
			body: { launchId: "orphan-1" },
			deduplicationId: "slack-agent-launch:orphan-1:0",
		});
	});

	test("a scheduling failure never fails the run", async () => {
		publishJSON.mockImplementationOnce(async () => {
			throw new Error("qstash down");
		});
		await expect(
			recordAgentLaunches({
				threadSessionId: "thread-1",
				userId: "user-1",
				actions: [launched],
			}),
		).resolves.toBeUndefined();
	});
});

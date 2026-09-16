import { beforeEach, expect, mock, test } from "bun:test";

let postCount = 0;
const postMessage = mock(async (_args: Record<string, unknown>) => ({
	ts: `msg-${++postCount}`,
}));
const updateMessage = mock(async (_args: Record<string, unknown>) => ({}));
const deleteMessage = mock(async (_args: Record<string, unknown>) => ({}));
const setStatus = mock(async (_args: Record<string, unknown>) => ({}));
const addReaction = mock(async (_args: unknown) => ({}));
const removeReaction = mock(async (_args: unknown) => ({}));
const runAgent = mock(async (_args: Record<string, unknown>) => ({
	text: "**Completed**",
	actions: [],
}));
type Claim =
	| { status: "claimed"; id: string }
	| { status: "duplicate" }
	| { status: "stale" };
const claim = mock(
	async (_args: unknown): Promise<Claim> => ({
		status: "claimed",
		id: "delivery",
	}),
);
const finish = mock(async (_id: string, _succeeded: boolean) => {});
const findLink = mock(
	async (_args: unknown): Promise<{ userId: string } | undefined> => ({
		userId: "linked-user",
	}),
);
mock.module("@superset/db/client", () => ({
	db: {
		query: {
			integrationConnections: {
				findFirst: async () => ({
					organizationId: "org",
					accessToken: "token",
				}),
			},
			subscriptions: { findFirst: async () => ({ id: "subscription" }) },
		},
	},
}));
mock.module("@/env", () => ({
	env: { NEXT_PUBLIC_WEB_URL: "https://app.superset.sh" },
}));
mock.module("@/lib/analytics", () => ({ posthog: { capture: () => {} } }));
mock.module("../../lib/find-slack-user-link", () => ({
	findSlackUserLink: findLink,
}));
mock.module("../utils/generate-connect-url", () => ({
	generateConnectUrl: () => "https://app.superset.sh/connect",
}));
mock.module("../utils/run-agent", () => ({
	runSlackAgent: runAgent,
	resolveUserMentions: async () => (text: string) => text,
	formatErrorForSlack: async () => "Unable to finish",
	SlackAgentError: class extends Error {},
}));
mock.module("../utils/agent-delivery", () => ({
	claimAgentDelivery: claim,
	finishAgentDelivery: finish,
}));
const session = {
	id: "thread-session",
	quiet: false,
	entityLog: [
		{ kind: "workspace", id: "ws-1", label: "fix-login (feat/login)", at: "x" },
	],
};
const beginThread = mock(async (_args: unknown) => session);
const finishThread = mock(async (_args: unknown) => {});
const setQuiet = mock(async (_args: unknown) => {});
const followUpsEnabled = mock(async (_teamId: string) => true);
mock.module("../utils/thread-sessions", () => ({
	beginThreadRun: beginThread,
	finishThreadRun: finishThread,
	setThreadQuiet: setQuiet,
	threadFollowUpsEnabled: followUpsEnabled,
	parseThreadCommand: (text: string) => {
		const t = text
			.replace(/<@[A-Z0-9]+>/g, "")
			.trim()
			.toLowerCase();
		if (t.startsWith("!mute")) return "mute";
		if (t.startsWith("!unmute")) return "unmute";
		return null;
	},
	renderThreadMemory: (entities: { label: string }[]) =>
		entities.map((e) => e.label).join(", "),
}));
const { slackRateLimitRetryAfterMs } = await import(
	"../utils/slack-client/request-bounds"
);
mock.module("../utils/slack-client", () => ({
	createSlackClient: () => ({
		chat: { postMessage, update: updateMessage, delete: deleteMessage },
		assistant: { threads: { setStatus } },
		reactions: { add: addReaction, remove: removeReaction },
	}),
	isUnpostableChannelError: () => false,
	slackRateLimitRetryAfterMs,
}));
// Mock the barrel only; the image utility's own tests import its implementation.
mock.module("../utils/slack-image-assets", () => ({
	extractSlackImageAssets: async () => [],
	formatSlackImageAssetError: () => "Invalid image",
	SlackImageAssetError: class extends Error {},
}));
const { processAgentMessage } = await import("./process-agent-message");
const params = {
	teamId: "T1",
	eventId: "E1",
	event: {
		type: "app_mention" as const,
		user: "U1",
		text: "Help",
		channel: "C1",
		ts: "10.0",
		event_ts: "10.0",
		thread_ts: "1.0",
	},
};

beforeEach(() => {
	postCount = 0;
	postMessage.mockReset();
	postMessage.mockImplementation(async () => ({ ts: `msg-${++postCount}` }));
	updateMessage.mockClear();
	deleteMessage.mockClear();
	setStatus.mockClear();
	addReaction.mockClear();
	removeReaction.mockClear();
	runAgent.mockClear();
	claim.mockClear();
	finish.mockClear();
	findLink.mockClear();
	beginThread.mockClear();
	finishThread.mockClear();
	setQuiet.mockClear();
	followUpsEnabled.mockReset();
	followUpsEnabled.mockImplementation(async () => true);
});

test("with the flag off, no session is opened, no memory is injected, and no quiet tool is offered", async () => {
	followUpsEnabled.mockImplementationOnce(async () => false);
	await processAgentMessage(params);
	expect(beginThread).not.toHaveBeenCalled();
	expect(finishThread).not.toHaveBeenCalled();
	expect(runAgent.mock.calls[0]?.[0]).not.toHaveProperty("threadMemory");
	expect(runAgent.mock.calls[0]?.[0]).not.toHaveProperty("threadQuiet");
	expect(postMessage.mock.calls.at(-1)?.[0].text).toBe("**Completed**");
});

test("with the flag off, !mute is an ordinary message", async () => {
	followUpsEnabled.mockImplementationOnce(async () => false);
	await processAgentMessage({
		...params,
		event: { ...params.event, text: "<@UBOT> !mute" },
	});
	expect(setQuiet).not.toHaveBeenCalled();
	expect(runAgent).toHaveBeenCalledTimes(1);
});

test("!unmute reopens the thread without running the agent", async () => {
	await processAgentMessage({
		...params,
		event: { ...params.event, text: "<@UBOT> !unmute" },
	});
	expect(setQuiet).toHaveBeenCalledWith(
		expect.objectContaining({ quiet: false }),
	);
	expect(runAgent).not.toHaveBeenCalled();
	expect(postMessage.mock.calls[0]?.[0].text).toContain(
		"answer replies in this thread again",
	);
});

test("the agent is given the thread's quiet state and a way to change it", async () => {
	beginThread.mockImplementationOnce(async () => ({ ...session, quiet: true }));
	await processAgentMessage(params);
	const args = runAgent.mock.calls[0]?.[0] as {
		threadQuiet: { quiet: boolean; set: (q: boolean) => Promise<void> };
	};
	expect(args.threadQuiet.quiet).toBe(true);
	await args.threadQuiet.set(false);
	expect(setQuiet).toHaveBeenCalledWith(
		expect.objectContaining({ threadTs: "1.0", quiet: false }),
	);
});

test("a run opens the thread session, hands its memory to the agent, and records what was made", async () => {
	runAgent.mockImplementationOnce(async () => ({
		text: "Done",
		actions: [
			{
				type: "task_created",
				tasks: [{ id: "t1", slug: "SUP-9", title: "x" }],
			},
		],
	}));
	await processAgentMessage(params);
	expect(beginThread).toHaveBeenCalledWith({
		organizationId: "org",
		teamId: "T1",
		channelId: "C1",
		threadTs: "1.0",
		userId: "linked-user",
	});
	expect(runAgent.mock.calls[0]?.[0]).toMatchObject({
		threadMemory: "fix-login (feat/login)",
	});
	expect(finishThread).toHaveBeenCalledWith({
		id: "thread-session",
		actions: [
			{
				type: "task_created",
				tasks: [{ id: "t1", slug: "SUP-9", title: "x" }],
			},
		],
		lastContextTs: "10.0",
	});
});

test("!mute quiets the thread without running the agent", async () => {
	await processAgentMessage({
		...params,
		event: { ...params.event, text: "<@UBOT> !mute" },
	});
	expect(setQuiet).toHaveBeenCalledWith({
		organizationId: "org",
		teamId: "T1",
		channelId: "C1",
		threadTs: "1.0",
		userId: "linked-user",
		quiet: true,
	});
	expect(runAgent).not.toHaveBeenCalled();
	expect(claim).not.toHaveBeenCalled();
	expect(postMessage.mock.calls[0]?.[0].text).toContain(
		"stay out of this thread",
	);
});

test("prose about mentions is an ordinary request, not a mute", async () => {
	await processAgentMessage({
		...params,
		event: {
			...params.event,
			text: "<@UBOT> build a bot that should only respond when mentioned",
		},
	});
	expect(setQuiet).not.toHaveBeenCalled();
	expect(runAgent).toHaveBeenCalledTimes(1);
});

test("a thread reply without a mention runs through the same path", async () => {
	await processAgentMessage({
		...params,
		event: { ...params.event, type: "message", channel_type: "channel" },
	});
	expect(runAgent).toHaveBeenCalledTimes(1);
	expect(beginThread).toHaveBeenCalledTimes(1);
});

test("mentions run as their linked author and post a final Markdown reply", async () => {
	await processAgentMessage(params);
	expect(findLink).toHaveBeenCalledWith({
		organizationId: "org",
		slackUserId: "U1",
		teamId: "T1",
	});
	expect(runAgent.mock.calls[0]?.[0]).toMatchObject({
		userId: "linked-user",
		messageTs: "10.0",
		threadTs: "1.0",
	});
	// Channel: a placeholder carries progress, the final reply is a new
	// message, and the placeholder is removed once the reply exists.
	expect(postMessage).toHaveBeenCalledTimes(2);
	expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
		thread_ts: "1.0",
		text: "Thinking...",
	});
	expect(postMessage.mock.calls[1]?.[0]).toMatchObject({
		thread_ts: "1.0",
		text: "**Completed**",
		blocks: [{ type: "markdown", text: "**Completed**" }],
	});
	expect(deleteMessage).toHaveBeenCalledWith({ channel: "C1", ts: "msg-1" });
	expect(setStatus).not.toHaveBeenCalled();
	expect(finish).toHaveBeenCalledWith("delivery", true);
	expect(removeReaction).toHaveBeenCalledTimes(1);
});

test("the final reply waits out a short rate limit and retries once", async () => {
	const rateLimited = Object.assign(new Error("rate limited"), {
		code: "slack_webapi_rate_limited_error",
		retryAfter: 0,
	});
	postMessage.mockImplementation(async (args) => {
		if (args.text === "**Completed**" && postMessage.mock.calls.length === 2) {
			throw rateLimited;
		}
		return { ts: `msg-${++postCount}` };
	});
	await processAgentMessage(params);
	const finals = postMessage.mock.calls.filter(
		([args]) => args.text === "**Completed**",
	);
	expect(finals).toHaveLength(2);
	expect(finish).toHaveBeenCalledWith("delivery", true);
});

test("a rate limit that outlives the budget is not waited on", async () => {
	postMessage.mockImplementation(async (args) => {
		if (args.text === "**Completed**") {
			throw Object.assign(new Error("rate limited"), {
				code: "slack_webapi_rate_limited_error",
				retryAfter: 600,
			});
		}
		return { ts: `msg-${++postCount}` };
	});
	await processAgentMessage(params);
	expect(finish).toHaveBeenCalledWith("delivery", false);
	expect(postMessage.mock.calls.at(-1)?.[0].text).toBe("Unable to finish");
});

test("channel progress updates edit the placeholder instead of posting", async () => {
	runAgent.mockImplementationOnce(async (args) => {
		await (args.onProgress as (s: string) => Promise<void>)("Creating task...");
		return { text: "Done", actions: [] };
	});
	await processAgentMessage(params);
	expect(updateMessage).toHaveBeenCalledWith({
		channel: "C1",
		ts: "msg-1",
		text: "Creating task...",
	});
	expect(postMessage).toHaveBeenCalledTimes(2);
});

test("a stale claim posts a lost-track notice and clears indicators without running", async () => {
	claim.mockImplementationOnce(async () => ({ status: "stale" }));
	await processAgentMessage(params);
	expect(runAgent).not.toHaveBeenCalled();
	expect(finish).not.toHaveBeenCalled();
	expect(postMessage).toHaveBeenCalledTimes(1);
	expect(postMessage.mock.calls[0]?.[0].text).toContain("lost track");
	expect(removeReaction).toHaveBeenCalledTimes(1);
});

test("the claim happens before image preflight so a killed preflight is still recognised", async () => {
	await processAgentMessage(params);
	expect(claim).toHaveBeenCalledTimes(1);
	const claimOrder = claim.mock.invocationCallOrder[0] ?? 0;
	const agentOrder = runAgent.mock.invocationCallOrder[0] ?? 0;
	expect(claimOrder).toBeLessThan(agentOrder);
	expect(runAgent.mock.calls[0]?.[0]).toHaveProperty("deadline");
});

test("a duplicate delivery does not run, post, or clear another run's indicators", async () => {
	claim.mockImplementationOnce(async () => ({ status: "duplicate" }));
	await processAgentMessage(params);
	expect(runAgent).not.toHaveBeenCalled();
	expect(postMessage).not.toHaveBeenCalled();
	expect(setStatus).not.toHaveBeenCalled();
	expect(removeReaction).not.toHaveBeenCalled();
});

test("an unlinked author only receives a connect prompt", async () => {
	findLink.mockImplementationOnce(async () => undefined);
	await processAgentMessage(params);
	expect(runAgent).not.toHaveBeenCalled();
	expect(claim).not.toHaveBeenCalled();
	expect(postMessage.mock.calls[0]?.[0].text).toContain(
		"link your Slack account",
	);
});

test("DMs use the same guarded path with assistant status instead of a placeholder", async () => {
	await processAgentMessage({
		...params,
		event: { ...params.event, type: "message", channel_type: "im" },
	});
	expect(runAgent).toHaveBeenCalledTimes(1);
	expect(claim).toHaveBeenCalledWith({
		teamId: "T1",
		channelId: "C1",
		messageTs: "10.0",
	});
	expect(setStatus.mock.calls[0]?.[0]).toMatchObject({ status: "Thinking..." });
	expect(setStatus.mock.calls.at(-1)?.[0]).toMatchObject({ status: "" });
	expect(postMessage).toHaveBeenCalledTimes(1);
	expect(postMessage.mock.calls[0]?.[0].text).toBe("**Completed**");
	expect(deleteMessage).not.toHaveBeenCalled();
});

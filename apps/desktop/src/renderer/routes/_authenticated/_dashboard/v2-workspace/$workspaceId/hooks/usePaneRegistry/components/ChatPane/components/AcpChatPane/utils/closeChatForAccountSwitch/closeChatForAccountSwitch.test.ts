import { expect, mock, test } from "bun:test";
import { setImmediate as flush } from "node:timers/promises";
import type { UserContent } from "@superset/chat/protocol";
import { createChatRouter } from "@superset/chat-runtime";
import {
	createTestRuntime,
	fakeHarnessRegistry,
} from "@superset/chat-runtime/testing";
import { closeChatForAccountSwitch } from "./closeChatForAccountSwitch";

const prompts: UserContent[][] = [
	[{ type: "text", text: "first queued task" }],
	[
		{ type: "text", text: "second queued task" },
		{
			type: "attachment",
			attachmentId: "image-1",
			name: "screen.png",
			mimeType: "image/png",
			url: "data:image/png;base64,AA==",
		},
	],
];

test("an account switch preserves the full queue before disposing the old session", async () => {
	const { harnesses, adapters } = fakeHarnessRegistry({
		start: [
			{
				kind: "session",
				session: { status: "idle", usageLimit: { hitAtMs: 1 } },
			},
		],
		turns: [],
	});
	const runtime = createTestRuntime({ harnesses });
	const transport = createChatRouter(runtime, {
		resolveCwd: () => "/tmp",
	}).createCaller({});
	try {
		const { sessionId } = await transport.createSession({
			commandId: crypto.randomUUID(),
			workspaceId: "workspace-1",
			harness: "fake",
		});
		await flush();
		for (const content of prompts) {
			await transport.prompt({
				commandId: crypto.randomUUID(),
				sessionId,
				clientId: crypto.randomUUID(),
				content,
			});
		}
		const setAccount = mock(async () => {
			expect(runtime.live.require(sessionId).queuedCount).toBe(2);
		});
		const saved = await closeChatForAccountSwitch({
			transport,
			sessionId,
			setAccount,
		});
		expect(setAccount).toHaveBeenCalledTimes(1);
		expect(runtime.live.get(sessionId)).toBeNull();
		expect(saved).toEqual(prompts);
		const { sessionId: replacement } = await transport.createSession({
			commandId: crypto.randomUUID(),
			workspaceId: "workspace-1",
			harness: "fake",
		});
		await flush();
		for (const content of saved) {
			await transport.prompt({
				commandId: crypto.randomUUID(),
				sessionId: replacement,
				clientId: crypto.randomUUID(),
				content,
			});
		}
		expect(
			(await transport.getQueue({ sessionId: replacement })).prompts.map(
				(p) => p.content,
			),
		).toEqual(prompts);
		expect(adapters).toHaveLength(2);
	} finally {
		await runtime.dispose();
	}
});

test.each([
	"queue",
	"account",
] as const)("a failed %s read or change leaves the original session open", async (failure) => {
	const closeSession = mock(async () => undefined);
	const setAccount = mock(async () => {
		throw new Error("account failed");
	});
	const respondToUsageLimit = mock<
		Parameters<
			typeof closeChatForAccountSwitch
		>[0]["transport"]["respondToUsageLimit"]
	>(async () => undefined);
	const getQueue = mock(async () => {
		if (failure === "queue") throw new Error("queue failed");
		return { live: true, paused: true, prompts: [] };
	});
	await expect(
		closeChatForAccountSwitch({
			transport: { closeSession, respondToUsageLimit, getQueue },
			sessionId: "old",
			setAccount,
		}),
	).rejects.toThrow(`${failure} failed`);
	expect(respondToUsageLimit.mock.calls[0]?.[0]).toMatchObject({
		sessionId: "old",
		action: "cancel_resume_at_reset",
	});
	expect(closeSession).not.toHaveBeenCalled();
	if (failure === "queue") expect(setAccount).not.toHaveBeenCalled();
});

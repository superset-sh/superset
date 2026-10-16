import { expect, test } from "bun:test";
import type { UserContent } from "@superset/chat/protocol";
import { pendingChatPrompts, prependChatPrompts } from "./pendingChatPrompts";

test("the recovered host queue precedes local drafts without losing attachments or repeating the initial prompt", () => {
	const hostQueue: UserContent[][] = [
		[{ type: "text", text: "queued on host" }],
	];
	const draft: UserContent[] = [
		{ type: "text", text: "typed while restarting" },
	];
	const data = {
		terminalId: "terminal",
		sessionId: "old",
		pendingPrompt: "initial",
		pendingAttachments: [
			{
				attachmentId: "image-1",
				name: "screen.png",
				mimeType: "image/png",
				url: "data:image/png;base64,AA==",
			},
		],
		queuedPrompts: [draft],
	};
	const next = prependChatPrompts(data, hostQueue);
	expect(pendingChatPrompts(next)).toEqual([
		...hostQueue,
		[
			{ type: "text", text: "initial" },
			{ type: "attachment", ...data.pendingAttachments[0] },
		],
		draft,
	]);
	expect(next).not.toHaveProperty("pendingPrompt");
	expect(next).not.toHaveProperty("pendingAttachments");
	expect(data.pendingPrompt).toBe("initial");
});

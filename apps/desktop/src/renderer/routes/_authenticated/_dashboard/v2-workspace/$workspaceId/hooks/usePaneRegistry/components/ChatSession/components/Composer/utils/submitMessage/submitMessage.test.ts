import { expect, mock, test } from "bun:test";
import type { PromptInputSubmitPayload } from "@superset/chat-ui/PromptInput";
import { submitMessage } from "./submitMessage";

const draft: PromptInputSubmitPayload = {
	text: "Review the file",
	files: [],
	mentions: [],
	steer: false,
};

test("failed attachment upload declines submission without sending", async () => {
	const onSend = mock();
	const result = await submitMessage(draft, {
		uploadAttachments: async () => null,
		onSend,
	});
	expect(result).toBe(false);
	expect(onSend).not.toHaveBeenCalled();
});

test("submission remains pending until the send callback accepts", async () => {
	let accept!: () => void;
	const pending = new Promise<void>((resolve) => {
		accept = resolve;
	});
	let settled = false;
	const result = submitMessage(draft, {
		uploadAttachments: async () => [],
		onSend: () => pending,
	}).then(() => {
		settled = true;
	});
	await Promise.resolve();
	await Promise.resolve();
	expect(settled).toBe(false);
	accept();
	await result;
	expect(settled).toBe(true);
});

test("a declined send propagates false so the composer retains its draft", async () => {
	expect(
		await submitMessage(draft, {
			uploadAttachments: async () => [],
			onSend: async () => false,
		}),
	).toBe(false);
});

test("rejected sends remain rejected so the composer does not clear its draft", async () => {
	const failure = new Error("Transport unavailable");
	await expect(
		submitMessage(draft, {
			uploadAttachments: async () => [],
			onSend: async () => {
				throw failure;
			},
		}),
	).rejects.toBe(failure);
});

test("accepted sends retain attachment tags, chip metadata and steering", async () => {
	const onSend = mock(() => ({ clientId: "accepted-outbox-entry" }));
	await submitMessage(
		{
			...draft,
			text: "Read example.ts",
			mentions: [
				{
					label: "Example",
					serialized: "example.ts",
					data: { elementKind: "file_mention" },
				},
			],
			steer: true,
		},
		{
			uploadAttachments: async () => ["[attachment: review.txt]"],
			onSend,
		},
	);
	expect(onSend).toHaveBeenCalledWith(
		[
			{
				type: "text",
				text: "Read example.ts\n[attachment: review.txt]",
				elements: [
					{
						byteRange: { start: 5, end: 15 },
						elementKind: "file_mention",
						label: "Example",
					},
				],
			},
		],
		{ steer: true },
	);
});

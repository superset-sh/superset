import type { UserContent } from "@superset/chat/protocol";
import type { PromptInputSubmitPayload } from "@superset/chat-ui/PromptInput";
import { elementsForChips } from "../../../../utils/messageElements";

export async function submitMessage(
	{ text, files, mentions, steer }: PromptInputSubmitPayload,
	{
		uploadAttachments,
		onSend,
	}: {
		uploadAttachments: (files: File[]) => Promise<string[] | null>;
		onSend: (content: UserContent[], options: { steer: boolean }) => unknown;
	},
) {
	const tags = await uploadAttachments(files);
	if (!tags) return false;
	const elements = elementsForChips(text.trim(), mentions);
	const result = await onSend(
		[
			{
				type: "text",
				text: [text.trim(), ...tags].filter(Boolean).join("\n"),
				...(elements.length > 0 ? { elements } : {}),
			},
		],
		{ steer },
	);
	if (result === false) return false;
}

import type { UserContent } from "@superset/chat/protocol";
import type { ChatPaneData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

export function pendingChatPrompts(data: ChatPaneData): UserContent[][] {
	const firstPrompt: UserContent[] =
		data.pendingPrompt || data.pendingAttachments?.length
			? [
					...(data.pendingPrompt
						? [{ type: "text" as const, text: data.pendingPrompt }]
						: []),
					...(data.pendingAttachments ?? []).map((attachment) => ({
						type: "attachment" as const,
						...attachment,
					})),
				]
			: [];
	return [
		...(firstPrompt.length > 0 ? [firstPrompt] : []),
		...(data.queuedPrompts ?? []),
	];
}

export function prependChatPrompts(
	data: ChatPaneData,
	prompts: UserContent[][],
): ChatPaneData {
	const {
		pendingPrompt: _prompt,
		pendingAttachments: _attachments,
		...rest
	} = data;
	return { ...rest, queuedPrompts: [...prompts, ...pendingChatPrompts(data)] };
}

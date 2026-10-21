import { useLingui } from "@lingui/react/macro";
import { userMessageText } from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";
import { errorMessage, rawErrorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import {
	formatAttachmentTag,
	parseAttachmentTags,
} from "../../../../utils/attachmentTags";
import type { ComposerProps } from "../../Composer";

const ALREADY_GONE = /is not queued$/;

export function useQueueActions(promptQueue: ComposerProps["promptQueue"]) {
	const { t } = useLingui();

	const runQueueAction = useCallback(
		async (action: () => Promise<void>) => {
			try {
				await action();
				return true;
			} catch (error) {
				toast.error(t({ message: "Couldn't update the queue" }), {
					description: errorMessage(error, t({ message: "Unknown error" })),
				});
				return false;
			}
		},
		[t],
	);

	// The edited text keeps the prompt's attachments; mention ranges are dropped
	// because the text they pointed into has changed.
	const updateQueued = useCallback(
		async (prompt: UserMessage, text: string) => {
			if (!promptQueue) return;
			const { attachments } = parseAttachmentTags(userMessageText(prompt));
			const content = [
				text.trim(),
				...attachments.map((attachment) => formatAttachmentTag(attachment)),
			]
				.filter(Boolean)
				.join("\n");
			await runQueueAction(() =>
				promptQueue.update(prompt.id, [
					{ type: "text", text: content },
					...prompt.content.filter((part) => part.type !== "text"),
				]),
			);
		},
		[promptQueue, runQueueAction],
	);

	const clearQueued = useCallback(async () => {
		if (!promptQueue) return;
		await runQueueAction(async () => {
			const results = await Promise.allSettled(
				promptQueue.prompts.map((prompt) => promptQueue.remove(prompt.id)),
			);
			const failed = results.find(
				(result): result is PromiseRejectedResult =>
					result.status === "rejected" &&
					!ALREADY_GONE.test(rawErrorMessage(result.reason)),
			);
			if (failed) throw failed.reason;
		});
	}, [promptQueue, runQueueAction]);

	return {
		onClear: () => void clearQueued(),
		onUpdate: (prompt: UserMessage, text: string) =>
			void updateQueued(prompt, text),
		onRemove: (id: string) => {
			if (promptQueue) void runQueueAction(() => promptQueue.remove(id));
		},
		onResume: () => {
			if (promptQueue) void runQueueAction(promptQueue.resume);
		},
		onSteer: (id: string) => {
			if (promptQueue) void runQueueAction(() => promptQueue.steer(id));
		},
	};
}

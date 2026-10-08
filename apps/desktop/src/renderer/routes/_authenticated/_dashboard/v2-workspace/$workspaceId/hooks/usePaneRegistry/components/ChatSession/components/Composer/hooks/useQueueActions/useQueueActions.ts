import { useLingui } from "@lingui/react/macro";
import { userMessageText } from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";
import type { PromptInputHandle } from "@superset/chat-ui/PromptInput";
import { errorMessage, rawErrorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { type RefObject, useCallback } from "react";
import type { ComposerProps } from "../../Composer";

const ALREADY_GONE = /is not queued$/;

export function useQueueActions(
	promptQueue: ComposerProps["promptQueue"],
	promptInputRef: RefObject<PromptInputHandle | null>,
) {
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

	const editQueued = useCallback(
		async (prompt: UserMessage) => {
			if (!promptQueue) return;
			if (!(await runQueueAction(() => promptQueue.remove(prompt.id)))) return;
			promptInputRef.current?.appendText(userMessageText(prompt));
		},
		[promptQueue, runQueueAction, promptInputRef],
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
		onEdit: (prompt: UserMessage) => void editQueued(prompt),
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

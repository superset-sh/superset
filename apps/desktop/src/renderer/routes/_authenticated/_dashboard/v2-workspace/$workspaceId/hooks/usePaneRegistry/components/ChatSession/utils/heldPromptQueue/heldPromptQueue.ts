import type { UserContent, UserMessage } from "@superset/chat/protocol";

const NOTHING = async () => {};

export function heldPromptQueue(queued: UserContent[][]) {
	if (queued.length === 0) return undefined;
	return {
		prompts: queued.map(
			(content, index): UserMessage => ({
				id: `held-${index}`,
				kind: "user_message",
				startedAtMs: 0,
				queued: true,
				content,
			}),
		),
		paused: false,
		actionable: false,
		remove: NOTHING,
		resume: NOTHING,
		steer: NOTHING,
	};
}

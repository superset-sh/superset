import { randomUUID } from "node:crypto";
import type { ChatRuntime } from "@superset/chat-runtime";

export async function promptChatSession({
	runtime,
	chatSessionId,
	text,
	acquireDelivery,
	signal,
}: {
	runtime: ChatRuntime;
	chatSessionId: string;
	text: string;
	acquireDelivery: () => Promise<{ isValid: () => boolean } | null>;
	signal: AbortSignal;
}): Promise<void> {
	if (signal.aborted) throw new Error("Delivery was cancelled");
	const assertRunning = () => {
		if (runtime.live.get(chatSessionId)?.state.status === "dead") {
			throw new Error("The chat's agent is no longer running");
		}
	};
	assertRunning();
	const delivery = await acquireDelivery();
	if (!delivery?.isValid()) throw new Error("Delivery ownership changed");
	assertRunning();
	runtime.commands.prompt({
		commandId: randomUUID(),
		sessionId: chatSessionId,
		clientId: randomUUID(),
		content: [{ type: "text", text }],
	});
}

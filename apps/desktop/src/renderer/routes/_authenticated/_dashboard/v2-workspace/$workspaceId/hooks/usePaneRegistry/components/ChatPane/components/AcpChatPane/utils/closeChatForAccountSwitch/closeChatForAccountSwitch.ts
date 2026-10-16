import type { ChatTransport } from "@superset/chat/client";
import type { UserContent } from "@superset/chat/protocol";

type Transport = Pick<ChatTransport, "getQueue"> & {
	respondToUsageLimit(
		input: Parameters<ChatTransport["respondToUsageLimit"]>[0],
	): Promise<unknown>;
	closeSession(
		input: Parameters<ChatTransport["closeSession"]>[0],
	): Promise<unknown>;
};

export async function closeChatForAccountSwitch({
	transport,
	sessionId,
	setAccount,
}: {
	transport: Transport;
	sessionId: string;
	setAccount: () => Promise<unknown>;
}): Promise<UserContent[][]> {
	await transport.respondToUsageLimit({
		sessionId,
		commandId: crypto.randomUUID(),
		action: "cancel_resume_at_reset",
	});
	const { prompts } = await transport.getQueue({ sessionId });
	await setAccount();
	await transport.closeSession({ sessionId });
	return prompts.map((prompt) => prompt.content);
}

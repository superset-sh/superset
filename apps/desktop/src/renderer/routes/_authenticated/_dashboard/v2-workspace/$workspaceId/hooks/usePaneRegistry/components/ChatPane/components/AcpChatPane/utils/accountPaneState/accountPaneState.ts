import type { ChatPaneData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

export function accountChatDraftKey(
	data: Pick<ChatPaneData, "accountDraftId" | "terminalId">,
): string {
	return `chat-v3-draft:${data.accountDraftId ?? data.terminalId}`;
}

export function adoptAccountChatSession(
	data: ChatPaneData,
	result: { sessionId: string; terminalId: string },
): ChatPaneData {
	const { accountLaunch: _consumed, ...rest } = data;
	return {
		...rest,
		accountBound: true,
		// An existing pane may predate the stable draft marker. Preserve its old
		// key before replacing the terminal ID with the host's authoritative one.
		accountDraftId: data.accountDraftId ?? data.terminalId,
		sessionId: result.sessionId,
		terminalId: result.terminalId,
	};
}

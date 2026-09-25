import type { UserContent } from "@superset/chat/protocol";
import { useCallback, useState } from "react";
import type { HarnessId } from "./components/NewSessionView";
import { NewSessionView } from "./components/NewSessionView";
import { SessionPicker } from "./components/SessionPicker";
import { SessionView } from "./components/SessionView";
import { useSessionClient } from "./hooks/useSessionClient";

export function ChatV3Pane({
	onSessionIdChange,
	sessionId,
	workspaceId,
}: {
	workspaceId: string;
	sessionId: string | null;
	onSessionIdChange: (sessionId: string | null) => void;
}) {
	const { client, wiring } = useSessionClient(sessionId);
	const [harness, setHarness] = useState<HarnessId>("claude-code");
	const [pendingFirstPrompt, setPendingFirstPrompt] = useState<
		UserContent[] | null
	>(null);

	const createSession = useCallback(
		async (content: UserContent[] | null) => {
			const created = await wiring.transport.createSession({
				commandId: crypto.randomUUID(),
				workspaceId,
				harness,
			});
			setPendingFirstPrompt(content);
			onSessionIdChange(created.sessionId);
		},
		[wiring.transport, workspaceId, harness, onSessionIdChange],
	);

	const picker = (
		<SessionPicker
			activeSessionId={sessionId}
			onNewSession={() => onSessionIdChange(null)}
			onSelect={onSessionIdChange}
			transport={wiring.transport}
			workspaceId={workspaceId}
		/>
	);

	if (!client || !sessionId) {
		return (
			<NewSessionView
				harness={harness}
				headerLeft={picker}
				onHarnessChange={setHarness}
				onSend={(content) => void createSession(content)}
				workspaceId={workspaceId}
			/>
		);
	}

	return (
		<SessionView
			client={client}
			headerLeft={picker}
			key={sessionId}
			onFirstPromptSent={() => setPendingFirstPrompt(null)}
			pendingFirstPrompt={pendingFirstPrompt}
			sessionId={sessionId}
		/>
	);
}

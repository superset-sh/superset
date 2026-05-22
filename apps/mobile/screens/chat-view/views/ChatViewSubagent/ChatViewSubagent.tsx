import { ChatView, type ChatViewProps } from "../../components/ChatView";
import {
	MOCK_COMPOSER_SETTINGS,
	MOCK_HEADER,
	MOCK_THREAD_SUBAGENT,
} from "../../mock-data";

export type ChatViewSubagentProps = Pick<ChatViewProps, "className">;

/** UC-RENDER-06 §A — nested subagent execution rendered as a collapsed block. */
export function ChatViewSubagent({ className }: ChatViewSubagentProps) {
	return (
		<ChatView
			className={className}
			header={{ ...MOCK_HEADER, status: "live", statusLabel: "Done" }}
			items={MOCK_THREAD_SUBAGENT}
			composer={{
				state: "idle",
				rowProps: {
					settings: MOCK_COMPOSER_SETTINGS,
					onCommandsPress: () => {},
				},
			}}
		/>
	);
}

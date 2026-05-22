import { ChatView, type ChatViewProps } from "../../components/ChatView";
import {
	MOCK_COMPOSER_SETTINGS,
	MOCK_HEADER,
	MOCK_THREAD_TOOL_CALLS,
} from "../../mock-data";

export type ChatViewToolCallsProps = Pick<ChatViewProps, "className">;

/**
 * UC-RENDER-04 §A — three tool-call cards stacked: running · done · error.
 * Demonstrates the ToolCallCard status arc on a single thread.
 */
export function ChatViewToolCalls({ className }: ChatViewToolCallsProps) {
	return (
		<ChatView
			className={className}
			header={{ ...MOCK_HEADER, status: "streaming" }}
			items={MOCK_THREAD_TOOL_CALLS}
			composer={{
				state: "streaming",
				rowProps: {
					settings: MOCK_COMPOSER_SETTINGS,
					onCommandsPress: () => {},
				},
			}}
		/>
	);
}

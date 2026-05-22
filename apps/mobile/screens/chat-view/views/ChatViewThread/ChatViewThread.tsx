import { ChatView, type ChatViewProps } from "../../components/ChatView";
import {
	MOCK_COMPOSER_SETTINGS,
	MOCK_HEADER,
	MOCK_THREAD_STREAMING,
} from "../../mock-data";
import type { ComposerState } from "../../types";

export type ChatViewThreadProps = Pick<ChatViewProps, "className"> & {
	composerState?: ComposerState;
};

/**
 * UC-RENDER-01 §A — CANONICAL chat view. Header + user message + streaming
 * assistant turn + composer with Stop. Backbone of every other chat-view
 * design; all other views vary one slot.
 */
export function ChatViewThread({
	composerState = "streaming",
	className,
}: ChatViewThreadProps) {
	return (
		<ChatView
			className={className}
			header={{ ...MOCK_HEADER, status: "streaming" }}
			items={MOCK_THREAD_STREAMING}
			composer={{
				state: composerState,
				rowProps: {
					settings: MOCK_COMPOSER_SETTINGS,
					onCommandsPress: () => {},
				},
			}}
		/>
	);
}

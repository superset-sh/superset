import { ChatView, type ChatViewProps } from "../../components/ChatView";
import {
	MOCK_COMPOSER_SETTINGS,
	MOCK_HEADER,
	MOCK_THREAD_STREAMING,
} from "../../mock-data";
import type { ComposerState } from "../../types";

export type ChatViewComposerStatesProps = Pick<ChatViewProps, "className"> & {
	state?: ComposerState;
	value?: string;
};

const PLACEHOLDER_BY_STATE: Record<ComposerState, string> = {
	idle: "Message Sonnet 4.6…",
	typing: "Message Sonnet 4.6…",
	streaming: "(input disabled while streaming)",
	sending: "Sending…",
	disabled: "(input disabled — host offline)",
	hidden: "",
};

/**
 * Shared composer lifecycle view used by:
 *  - UC-COMP-01 §A — composer idle / empty (state=idle, value="")
 *  - UC-COMP-01 §B — composer typing + Send enabled (state=typing, value=…)
 *  - UC-COMP-03 §A — composer streaming + Stop (state=streaming)
 *
 * The thread above is the canonical streaming conversation so reviewers can
 * compare composer states against the same scrollback. Storybook stories
 * pick the state via argTypes.
 */
export function ChatViewComposerStates({
	state = "idle",
	value,
	className,
}: ChatViewComposerStatesProps) {
	return (
		<ChatView
			className={className}
			header={{
				...MOCK_HEADER,
				status: state === "streaming" ? "streaming" : "live",
			}}
			items={MOCK_THREAD_STREAMING}
			composer={{
				state,
				rowProps: {
					value,
					placeholder: PLACEHOLDER_BY_STATE[state],
					settings: MOCK_COMPOSER_SETTINGS,
					onCommandsPress: () => {},
				},
			}}
		/>
	);
}

import { ChatView, type ChatViewProps } from "../../components/ChatView";
import {
	MOCK_COMPOSER_SETTINGS,
	MOCK_HEADER,
	MOCK_THREAD_REASONING_PLAN,
} from "../../mock-data";

export type ChatViewReasoningPlanProps = Pick<ChatViewProps, "className">;

/**
 * UC-RENDER-05 §A — Plan block (expanded) and Reasoning block (collapsed)
 * shown together in the thread. The CollapsedBlock molecule manages its own
 * open/close state on tap, so this view is a static configuration that
 * reviewers can interact with.
 */
export function ChatViewReasoningPlan({
	className,
}: ChatViewReasoningPlanProps) {
	return (
		<ChatView
			className={className}
			header={{ ...MOCK_HEADER, status: "live", statusLabel: "Done" }}
			items={MOCK_THREAD_REASONING_PLAN}
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

import { useState } from "react";
import { View } from "react-native";
import { PendingActionPill } from "@/components/PendingActionPill";
import { ChatView, type ChatViewProps } from "../../components/ChatView";
import {
	MOCK_COMPOSER_SETTINGS,
	MOCK_HEADER,
	MOCK_THREAD_STREAMING,
} from "../../mock-data";
import type { PendingActionPillKind } from "../../types";

export type ChatViewPendingActionPillProps = Pick<
	ChatViewProps,
	"className"
> & {
	kind?: PendingActionPillKind;
	count?: number;
	visible?: boolean;
};

/**
 * UC-PAUSE-04 §A — floating "1 pending" / "QUESTION" / "PLAN" pill above the
 * composer when the user has dismissed an inline pause container without
 * responding. Composes PendingActionPill in the `floating` slot anchored
 * bottom-right.
 */
export function ChatViewPendingActionPill({
	kind = "approval",
	count = 1,
	visible = true,
	className,
}: ChatViewPendingActionPillProps) {
	const [tapped, setTapped] = useState(false);

	return (
		<ChatView
			className={className}
			header={{
				...MOCK_HEADER,
				status: "paused",
				statusLabel: "Awaiting response",
			}}
			items={MOCK_THREAD_STREAMING}
			floating={
				<View pointerEvents="box-none" className="absolute right-4 bottom-4">
					<PendingActionPill
						kind={kind}
						count={count}
						visible={visible && !tapped}
						onPress={() => setTapped(true)}
					/>
				</View>
			}
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

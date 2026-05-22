import { View } from "react-native";
import { ScrollBackButton } from "@/components/ScrollBackButton";
import { ChatView, type ChatViewProps } from "../../components/ChatView";
import {
	MOCK_COMPOSER_SETTINGS,
	MOCK_HEADER,
	MOCK_THREAD_STREAMING,
} from "../../mock-data";

export type ChatViewScrollBackProps = Pick<ChatViewProps, "className"> & {
	scrollBackVisible?: boolean;
	newMessagesCount?: number;
	onScrollBackPress?: () => void;
};

/**
 * UC-RENDER-07 §A — floating scroll-back FAB visible because the user has
 * scrolled away from the latest message. Toggle `scrollBackVisible` via the
 * Storybook control to see the FadeIn/FadeOut animation.
 */
export function ChatViewScrollBack({
	scrollBackVisible = true,
	newMessagesCount = 2,
	onScrollBackPress,
	className,
}: ChatViewScrollBackProps) {
	return (
		<ChatView
			className={className}
			header={{ ...MOCK_HEADER, status: "streaming" }}
			items={MOCK_THREAD_STREAMING}
			composer={{
				state: "idle",
				rowProps: {
					settings: MOCK_COMPOSER_SETTINGS,
					onCommandsPress: () => {},
				},
			}}
			floating={
				<View pointerEvents="box-none" className="absolute right-4 bottom-4">
					<ScrollBackButton
						visible={scrollBackVisible}
						newMessagesCount={newMessagesCount}
						onPress={onScrollBackPress}
					/>
				</View>
			}
		/>
	);
}

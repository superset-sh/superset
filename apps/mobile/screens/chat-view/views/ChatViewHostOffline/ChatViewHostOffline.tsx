import { Pressable } from "react-native";
import { Banner } from "@/components/Banner";
import { Text } from "@/components/ui/text";
import { ChatView, type ChatViewProps } from "../../components/ChatView";
import {
	MOCK_COMPOSER_SETTINGS,
	MOCK_HEADER,
	MOCK_THREAD_STREAMING,
} from "../../mock-data";

export type ChatViewHostOfflineProps = Pick<ChatViewProps, "className"> & {
	onRetry?: () => void;
};

/**
 * UC-PLATF-03 §A — host-offline banner above the chat thread. Composer
 * stays visible but disabled (Send slot inert) so the user keeps context
 * while reconnection is attempted.
 */
export function ChatViewHostOffline({
	onRetry,
	className,
}: ChatViewHostOfflineProps) {
	return (
		<ChatView
			className={className}
			header={{
				...MOCK_HEADER,
				status: "offline",
				statusLabel: "Host offline",
				banner: (
					<Banner
						variant="offline"
						headline="Host offline · retry to reconnect"
						body="Messages won't send until the host comes back online."
						cta={
							<Pressable accessibilityRole="button" onPress={onRetry}>
								<Text className="text-state-warning-fg font-semibold underline">
									Retry
								</Text>
							</Pressable>
						}
					/>
				),
			}}
			items={MOCK_THREAD_STREAMING}
			composer={{
				state: "disabled",
				rowProps: {
					settings: MOCK_COMPOSER_SETTINGS,
					onCommandsPress: () => {},
				},
			}}
		/>
	);
}

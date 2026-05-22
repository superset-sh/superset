import { Pressable, View } from "react-native";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { ChatView, type ChatViewProps } from "../../components/ChatView";
import { MOCK_HEADER } from "../../mock-data";

export type ChatViewErrorRetryProps = Pick<ChatViewProps, "className"> & {
	onRetry?: () => void;
};

/**
 * UC-SESS-02 §B — chat-view fetch failed; show a dispatch-failed banner over
 * an otherwise empty body with a centered Retry CTA. Composer is hidden until
 * the snapshot resolves so the screen stays focused on the error.
 */
export function ChatViewErrorRetry({
	onRetry,
	className,
}: ChatViewErrorRetryProps) {
	return (
		<ChatView
			className={className}
			header={{
				...MOCK_HEADER,
				status: "offline",
				statusLabel: "Failed to load",
				banner: (
					<Banner
						variant="dispatch-failed"
						headline="Failed to load session history"
						body="The host returned an error. Retry to try again."
						cta={
							<Pressable accessibilityRole="button" onPress={onRetry}>
								<Text className="text-state-danger-fg font-semibold underline">
									Retry
								</Text>
							</Pressable>
						}
					/>
				),
			}}
			body={
				<View className="flex-1 items-center justify-center px-8 gap-4">
					<Text variant="muted" className="text-center">
						We couldn't fetch this session's history.
					</Text>
					<Button onPress={onRetry}>
						<Text>Retry</Text>
					</Button>
				</View>
			}
			composer={null}
		/>
	);
}

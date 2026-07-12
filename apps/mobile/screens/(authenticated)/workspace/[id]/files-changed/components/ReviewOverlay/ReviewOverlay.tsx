import { Stack } from "expo-router";
import { ChevronDown, MessageSquareText } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";

// Native bottom toolbar: the jump control is a system bar button; the CTA is
// a custom bar item (Toolbar.View) — a solid capsule with a disclosure
// chevron, GitHub-style, since it opens the send-review sheet.
export function ReviewOverlay({
	draftCount,
	onFinishReview,
	onJumpToFile,
}: {
	draftCount: number;
	onFinishReview: () => void;
	onJumpToFile: () => void;
}) {
	return (
		<Stack.Toolbar placement="bottom">
			<Stack.Toolbar.Spacer />
			{draftCount > 0 ? (
				<Stack.Toolbar.View hidesSharedBackground>
					<PressableScale
						className="bg-green-600 flex-row items-center gap-1.5 rounded-full py-2.5 pr-3 pl-4"
						onPress={onFinishReview}
					>
						<Icon as={MessageSquareText} className="size-4 text-white" />
						<Text className="font-semibold text-[14px] text-white">
							{draftCount > 1 ? `Send to chat (${draftCount})` : "Send to chat"}
						</Text>
						<Icon as={ChevronDown} className="size-4 text-white/90" />
					</PressableScale>
				</Stack.Toolbar.View>
			) : null}
			<Stack.Toolbar.Button
				icon="list.number"
				accessibilityLabel="Jump to file"
				onPress={onJumpToFile}
			/>
		</Stack.Toolbar>
	);
}

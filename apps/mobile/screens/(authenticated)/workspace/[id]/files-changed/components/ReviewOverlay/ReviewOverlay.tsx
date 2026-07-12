import { Button, Host, HStack, Image, Text } from "@expo/ui/swift-ui";
import {
	backgroundOverlay,
	buttonBorderShape,
	buttonStyle,
	clipShape,
	environment,
	font,
	foregroundStyle,
	padding,
	tint,
} from "@expo/ui/swift-ui/modifiers";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const GLASS = isLiquidGlassAvailable();

// Native SwiftUI glass buttons (`.glass` / `.glassProminent`), not GlassView
// wrappers — system press morphing and the real material come for free.
export function ReviewOverlay({
	draftCount,
	onFinishReview,
	onJumpToFile,
}: {
	draftCount: number;
	onFinishReview: () => void;
	onJumpToFile: () => void;
}) {
	const insets = useSafeAreaInsets();

	return (
		<View
			className="absolute right-3 items-end"
			pointerEvents="box-none"
			style={{ bottom: Math.max(insets.bottom, 12) + 4 }}
		>
			<Host matchContents>
				<HStack spacing={10} modifiers={[environment("colorScheme", "dark")]}>
					{draftCount > 0 ? (
						<Button
							onPress={onFinishReview}
							modifiers={[
								buttonStyle(GLASS ? "glassProminent" : "borderedProminent"),
								buttonBorderShape("capsule"),
								tint("#16a34a"),
							]}
						>
							<HStack spacing={6}>
								<Text
									modifiers={[
										font({ size: 14, weight: "semibold" }),
										foregroundStyle("#ffffff"),
									]}
								>
									Finish review
								</Text>
								<Text
									modifiers={[
										font({ size: 11, weight: "bold" }),
										foregroundStyle("#15803d"),
										padding({ horizontal: 6, vertical: 2 }),
										backgroundOverlay({ color: "#ffffff" }),
										clipShape("capsule"),
									]}
								>
									{String(draftCount)}
								</Text>
							</HStack>
						</Button>
					) : null}
					<Button
						onPress={onJumpToFile}
						modifiers={[
							buttonStyle(GLASS ? "glass" : "bordered"),
							buttonBorderShape("circle"),
						]}
					>
						<Image systemName="list.number" size={16} color="#fafafa" />
					</Button>
				</HStack>
			</Host>
		</View>
	);
}

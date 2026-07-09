import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
	background,
	environment,
	presentationBackground,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SUPERSET_CHAT_MODELS } from "@superset/shared/agent-models";
import { Pressable, useWindowDimensions, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { SheetCloseButton } from "@/screens/(authenticated)/(home)/components/SheetCloseButton";
import { hslToHex } from "../../../../utils/hslToHex";

export function ModelPickerSheet({
	isPresented,
	onIsPresentedChange,
	selectedModelId,
	onSelect,
}: {
	isPresented: boolean;
	onIsPresentedChange: (value: boolean) => void;
	selectedModelId: string;
	onSelect: (modelId: string) => void;
}) {
	const theme = useTheme();
	const { width } = useWindowDimensions();

	return (
		<Host style={{ position: "absolute", width }}>
			<BottomSheet
				isPresented={isPresented}
				onIsPresentedChange={onIsPresentedChange}
				fitToContents
			>
				<Group
					modifiers={[
						environment("colorScheme", "dark"),
						presentationDragIndicator("visible"),
						background(theme.background),
						presentationBackground(hslToHex(theme.background)),
					]}
				>
					<RNHostView matchContents>
						<View className="px-5 pb-6 pt-5">
							<View className="relative mb-2 items-center justify-center">
								<View className="absolute left-0">
									<SheetCloseButton
										onPress={() => onIsPresentedChange(false)}
									/>
								</View>
								<Text
									className="text-center text-lg font-semibold"
									style={{ color: theme.foreground }}
								>
									Model
								</Text>
							</View>
							{SUPERSET_CHAT_MODELS.map((model) => {
								const isSelected = model.id === selectedModelId;
								return (
									<Pressable
										key={model.id}
										onPress={() => {
											onSelect(model.id);
											onIsPresentedChange(false);
										}}
										className="flex-row items-center gap-2.5 py-2.5"
									>
										<Text
											className="flex-1 text-sm font-medium"
											style={{ color: theme.foreground }}
										>
											{model.label}
										</Text>
										<Text
											className="text-xs"
											style={{ color: theme.mutedForeground }}
										>
											{model.provider}
										</Text>
										{isSelected ? (
											<Ionicons
												name="checkmark-circle"
												size={18}
												color={theme.primary}
											/>
										) : null}
									</Pressable>
								);
							})}
						</View>
					</RNHostView>
				</Group>
			</BottomSheet>
		</Host>
	);
}

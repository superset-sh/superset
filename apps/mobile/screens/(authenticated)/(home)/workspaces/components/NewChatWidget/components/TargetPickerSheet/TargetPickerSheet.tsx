import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
	background,
	environment,
	presentationBackground,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, useWindowDimensions, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { ProjectAvatar } from "@/screens/(authenticated)/(home)/filter/components/ProjectAvatar";
import { hslToHex } from "../../../../utils/hslToHex";
import type { NewChatTarget } from "../../hooks/useNewChatTargets";

export function TargetPickerSheet({
	isPresented,
	onIsPresentedChange,
	targets,
	selectedKey,
	onSelect,
}: {
	isPresented: boolean;
	onIsPresentedChange: (value: boolean) => void;
	targets: NewChatTarget[];
	selectedKey: string | null;
	onSelect: (target: NewChatTarget) => void;
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
						<View className="px-5 pb-6 pt-6">
							<Text
								className="mb-2 text-sm font-semibold"
								style={{ color: theme.mutedForeground }}
							>
								Projects
							</Text>
							{targets.length === 0 ? (
								<Text
									className="py-4 text-center text-sm"
									style={{ color: theme.mutedForeground }}
								>
									No projects on an online host
								</Text>
							) : null}
							{targets.map((target) => {
								const isSelected = target.key === selectedKey;
								return (
									<Pressable
										key={target.key}
										onPress={() => {
											onSelect(target);
											onIsPresentedChange(false);
										}}
										className="flex-row items-center gap-2.5 py-2.5"
									>
										<ProjectAvatar
											name={target.projectName}
											iconUrl={target.projectIconUrl}
											size={32}
										/>
										<View className="flex-1">
											<Text
												className="text-sm font-medium"
												style={{ color: theme.foreground }}
											>
												{target.projectName}
											</Text>
											<Text
												className="text-xs"
												style={{ color: theme.mutedForeground }}
											>
												{target.hostName}
											</Text>
										</View>
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

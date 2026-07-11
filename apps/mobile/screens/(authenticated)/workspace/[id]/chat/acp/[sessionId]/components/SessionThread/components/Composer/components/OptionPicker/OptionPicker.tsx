import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
	background,
	environment,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ChevronsUpDownIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";

export interface PickerOption {
	id: string;
	name: string;
	description?: string | null;
}

/** Keeps the list from growing past a comfortable sheet height; `fitToContents`
 * sizes the sheet to whatever this scroller reports. Same treatment as the
 * mastra composer's ModelPicker. */
const LIST_MAX_HEIGHT = 340;

/**
 * Fork of the mastra ModelPicker generalized to any ACP select: a small
 * "{current value} ⌄" chip that opens the option list in a native SwiftUI
 * bottom sheet. The options are whatever the ACP session reported (model /
 * effort config options, permission modes) — nothing is hardcoded client-side.
 */
export function OptionPicker({
	accessibilityLabel,
	options,
	activeId,
	onSelect,
	disabled,
}: {
	accessibilityLabel: string;
	options: PickerOption[];
	activeId?: string;
	onSelect: (optionId: string) => void;
	disabled?: boolean;
}) {
	const theme = useTheme();
	const { width } = useWindowDimensions();
	const [isPresented, setIsPresented] = useState(false);

	const activeOption = options.find((option) => option.id === activeId);
	// Fall back to the raw id: a session on a value the list doesn't carry
	// should still show *something* truthful rather than a generic label.
	const label = activeOption?.name ?? activeId ?? accessibilityLabel;

	const handleSelect = (optionId: string) => {
		onSelect(optionId);
		setIsPresented(false);
	};

	return (
		<>
			<Button
				accessibilityLabel={accessibilityLabel}
				className="h-auto flex-row items-center gap-1 rounded-full border-0 bg-transparent px-2 py-1"
				disabled={disabled}
				onPress={() => setIsPresented(true)}
				size="sm"
				variant="ghost"
			>
				<Text className="text-muted-foreground text-xs">{label}</Text>
				<Icon
					as={ChevronsUpDownIcon}
					className="size-3.5 text-muted-foreground"
				/>
			</Button>

			<Host style={{ position: "absolute", width }}>
				<BottomSheet
					fitToContents
					isPresented={isPresented}
					onIsPresentedChange={setIsPresented}
				>
					<Group
						modifiers={[
							environment("colorScheme", "dark"),
							presentationDragIndicator("visible"),
							background(theme.background),
						]}
					>
						<RNHostView matchContents>
							<View className="px-5 pt-6 pb-3">
								<ScrollView style={{ maxHeight: LIST_MAX_HEIGHT }}>
									{options.map((option) => (
										<Pressable
											accessibilityRole="button"
											accessibilityState={{ selected: option.id === activeId }}
											className="flex-row items-center gap-2.5 py-2.5"
											key={option.id}
											onPress={() => handleSelect(option.id)}
										>
											<View className="flex-1 gap-0.5">
												<Text
													className="font-medium text-sm"
													numberOfLines={1}
													style={{ color: theme.foreground }}
												>
													{option.name}
												</Text>
												{option.description ? (
													<Text
														className="text-xs"
														numberOfLines={2}
														style={{ color: theme.mutedForeground }}
													>
														{option.description}
													</Text>
												) : null}
											</View>
											{option.id === activeId ? (
												<Ionicons
													color={theme.primary}
													name="checkmark-circle"
													size={18}
												/>
											) : null}
										</Pressable>
									))}
								</ScrollView>
							</View>
						</RNHostView>
					</Group>
				</BottomSheet>
			</Host>
		</>
	);
}

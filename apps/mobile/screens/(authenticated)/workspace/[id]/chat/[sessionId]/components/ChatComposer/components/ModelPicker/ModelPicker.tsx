import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
	background,
	environment,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ChevronsUpDownIcon } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";

export interface ModelOption {
	id: string;
	name: string;
	provider: string;
}

/** Keeps the list from growing past a comfortable sheet height; `fitToContents`
 * sizes the sheet to whatever this scroller reports. Same treatment as the
 * workspace filter sheet's project list. */
const LIST_MAX_HEIGHT = 340;

/**
 * Composer model control: a small "{model name} ⌄" chip (à la Codex) that opens
 * the model list in a native SwiftUI bottom sheet — the same `@expo/ui/swift-ui`
 * `BottomSheet` the workspaces screen uses, so detents, drag indicator and
 * scrolling all behave like the rest of the app.
 */
export function ModelPicker({
	models,
	activeId,
	onSelect,
	disabled,
}: {
	models: ModelOption[];
	/** The model the next send will use: the user's pick, else the catalog default. */
	activeId?: string;
	onSelect: (modelId: string) => void;
	disabled?: boolean;
}) {
	const theme = useTheme();
	const { width } = useWindowDimensions();
	const [isPresented, setIsPresented] = useState(false);

	const activeModel = models.find((model) => model.id === activeId);
	// Fall back to the raw id: a session on a model that isn't in the cloud
	// catalog should still show *something* truthful rather than "Model".
	const label = activeModel?.name ?? activeId ?? "Model";

	// Group by provider, preserving the catalog's own ordering within a group.
	const groups = useMemo(() => {
		const byProvider = new Map<string, ModelOption[]>();
		for (const model of models) {
			const existing = byProvider.get(model.provider);
			if (existing) existing.push(model);
			else byProvider.set(model.provider, [model]);
		}
		return [...byProvider.entries()];
	}, [models]);

	const handleSelect = (modelId: string) => {
		onSelect(modelId);
		setIsPresented(false);
	};

	return (
		<>
			<Button
				accessibilityLabel="Select a model"
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
									{groups.map(([provider, providerModels]) => (
										<View key={provider}>
											<Text
												className="mb-2 font-semibold text-sm"
												style={{ color: theme.mutedForeground }}
											>
												{provider}
											</Text>
											{providerModels.map((model) => (
												<Pressable
													className="flex-row items-center gap-2.5 py-2.5"
													key={model.id}
													onPress={() => handleSelect(model.id)}
												>
													<Text
														className="flex-1 font-medium text-sm"
														numberOfLines={1}
														style={{ color: theme.foreground }}
													>
														{model.name}
													</Text>
													{model.id === activeId ? (
														<Ionicons
															color={theme.primary}
															name="checkmark-circle"
															size={18}
														/>
													) : null}
												</Pressable>
											))}
										</View>
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

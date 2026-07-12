import Ionicons from "@expo/vector-icons/Ionicons";
import { SUPERSET_CHAT_MODELS } from "@superset/shared/agent-models";
import { Stack, useRouter } from "expo-router";
import { Pressable, ScrollView } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { useNewChatPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newChatPreferencesStore";
import { ProviderLogo } from "./components/ProviderLogo";

export function ModelPickerScreen() {
	const router = useRouter();
	const theme = useTheme();
	const modelId = useNewChatPreferencesStore((state) => state.modelId);
	const setModelId = useNewChatPreferencesStore((state) => state.setModelId);

	return (
		<ScrollView
			className="bg-background flex-1 px-6"
			contentContainerStyle={{ flexGrow: 1, paddingVertical: 8 }}
		>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button icon="xmark" onPress={() => router.back()} />
			</Stack.Toolbar>
			{SUPERSET_CHAT_MODELS.map((model) => {
				const isSelected = model.id === modelId;
				return (
					<Pressable
						key={model.id}
						onPress={() => {
							setModelId(model.id);
							router.back();
						}}
						className="flex-row items-center gap-2.5 py-2.5"
					>
						<ProviderLogo provider={model.provider} />
						<Text
							className="flex-1 text-sm font-medium"
							style={{ color: theme.foreground }}
						>
							{model.label}
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
		</ScrollView>
	);
}

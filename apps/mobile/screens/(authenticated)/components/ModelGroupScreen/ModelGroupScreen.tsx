import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { posthog } from "@/lib/posthog";
import { useNewSessionPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore";
import { OptionRow } from "@/screens/(authenticated)/components/OptionRow";
import { useAgentLaunchPreferences } from "@/screens/(authenticated)/hooks/useAgentLaunchPreferences";

/**
 * One group of the model catalog — the pinned releases the main list keeps
 * behind a row. Picking returns to that list with the pick shown on the row.
 */
export function ModelGroupScreen() {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { presetId, group } = useLocalSearchParams<{
		presetId?: string;
		group?: string;
	}>();
	const launchPresetId = presetId || null;
	const { models, model } = useAgentLaunchPreferences(launchPresetId);
	const setModel = useNewSessionPreferencesStore((state) => state.setModel);
	const options = (models ?? []).filter((option) => option.group === group);

	return (
		<ScrollView
			className="bg-background flex-1 px-6"
			contentContainerStyle={{
				flexGrow: 1,
				paddingTop: 8,
				paddingBottom: insets.bottom + 8,
			}}
		>
			<Stack.Screen options={{ title: group ?? "" }} />
			{options.map((option) => (
				<OptionRow
					key={option.id}
					label={option.label}
					isSelected={option.id === model?.id}
					onPress={() => {
						if (!launchPresetId) return;
						setModel(launchPresetId, option.id);
						posthog.capture("new_session_model_selected", {
							agent: launchPresetId,
							model: option.id,
						});
						router.back();
					}}
					phLabel="new-session-model-row"
				/>
			))}
		</ScrollView>
	);
}

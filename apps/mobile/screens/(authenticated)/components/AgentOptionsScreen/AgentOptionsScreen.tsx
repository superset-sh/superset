import Ionicons from "@expo/vector-icons/Ionicons";
import { useLingui } from "@lingui/react/macro";
import { splitModelCatalog } from "@superset/shared/agent-models";
import { type Href, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { posthog } from "@/lib/posthog";
import { useNewSessionPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore";
import { OptionRow } from "@/screens/(authenticated)/components/OptionRow";
import { useAgentLaunchPreferences } from "@/screens/(authenticated)/hooks/useAgentLaunchPreferences";
import { SectionLabel } from "./components/SectionLabel";

/**
 * An agent's launch settings on one screen: the model, with the older pinned
 * releases a level down, and the reasoning effort under it. A pick sticks
 * immediately as the agent's remembered default; "Default" sends nothing and
 * the agent decides.
 */
export function AgentOptionsScreen({
	groupHref,
}: {
	/** Where a "Pinned releases ›" row goes — this stack's group screen. */
	groupHref: (params: { presetId: string; group: string }) => Href;
}) {
	const { t } = useLingui();
	const router = useRouter();
	const theme = useTheme();
	const insets = useSafeAreaInsets();
	const { presetId, agentLabel } = useLocalSearchParams<{
		presetId?: string;
		agentLabel?: string;
	}>();
	const launchPresetId = presetId || null;
	const { models, model, efforts, effort } =
		useAgentLaunchPreferences(launchPresetId);
	const setModel = useNewSessionPreferencesStore((state) => state.setModel);
	const setEffort = useNewSessionPreferencesStore((state) => state.setEffort);
	const { inline, groups } = splitModelCatalog(models ?? []);

	const pickModel = (id: string | null) => {
		if (!launchPresetId) return;
		setModel(launchPresetId, id);
		posthog.capture("new_session_model_selected", {
			agent: launchPresetId,
			model: id,
		});
	};
	const pickEffort = (id: string | null) => {
		if (!launchPresetId) return;
		setEffort(launchPresetId, id);
		posthog.capture("new_session_effort_selected", {
			agent: launchPresetId,
			effort: id,
		});
	};

	return (
		<ScrollView
			className="bg-background flex-1 px-6"
			contentContainerStyle={{
				flexGrow: 1,
				paddingBottom: insets.bottom + 8,
			}}
		>
			<Stack.Screen
				options={{ title: agentLabel || t({ message: "Model" }) }}
			/>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button icon="xmark" onPress={() => router.back()} />
			</Stack.Toolbar>
			{models !== undefined ? (
				<>
					<SectionLabel label={t({ message: "Model" })} />
					<OptionRow
						label={t({ message: "Default" })}
						isSelected={model === null}
						onPress={() => pickModel(null)}
						phLabel="new-session-model-row"
					/>
					{inline.map((option) => (
						<OptionRow
							key={option.id}
							label={option.label}
							isSelected={option.id === model?.id}
							onPress={() => pickModel(option.id)}
							phLabel="new-session-model-row"
						/>
					))}
					{groups.map((group) => (
						<Pressable
							key={group}
							onPress={() =>
								router.push(
									groupHref({ presetId: launchPresetId ?? "", group }),
								)
							}
							className="flex-row items-center gap-2.5 py-2.5"
							ph-label="new-session-model-group-row"
						>
							<Text
								className="flex-1 text-sm font-medium"
								style={{ color: theme.foreground }}
							>
								{group}
							</Text>
							{model?.group === group ? (
								<>
									<Text
										className="text-sm"
										style={{ color: theme.mutedForeground }}
									>
										{model.label}
									</Text>
									<Ionicons
										name="checkmark-circle"
										size={18}
										color={theme.primary}
									/>
								</>
							) : null}
							<Ionicons
								name="chevron-forward"
								size={16}
								color={theme.mutedForeground}
							/>
						</Pressable>
					))}
				</>
			) : null}
			{efforts.length > 0 ? (
				<>
					<SectionLabel label={t({ message: "Effort" })} />
					<OptionRow
						label={t({ message: "Default" })}
						isSelected={effort === null}
						onPress={() => pickEffort(null)}
						phLabel="new-session-effort-row"
					/>
					{efforts.map((option) => (
						<OptionRow
							key={option.id}
							label={option.label}
							isSelected={option.id === effort?.id}
							onPress={() => pickEffort(option.id)}
							phLabel="new-session-effort-row"
						/>
					))}
				</>
			) : null}
		</ScrollView>
	);
}

import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { SquareTerminal } from "lucide-react-native";
import { Image, Pressable, ScrollView } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { agentIconSource } from "@/lib/agent-icons";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { useNewChatTargets } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/hooks/useNewChatTargets";
import { useNewSessionPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore";

export function AgentMark({
	agentId,
	size,
	color,
}: {
	agentId: string;
	size: number;
	color: string;
}) {
	const source = agentIconSource(agentId);
	if (source === undefined) return <SquareTerminal size={size} color={color} />;
	return (
		<Image
			source={source}
			style={{ width: size, height: size, resizeMode: "contain" }}
		/>
	);
}

/**
 * Picks which host agent preset the next session launches with — the target
 * host's agent configs (Claude Code, Codex, …), fetched live so the list
 * matches what the host can actually run.
 */
export function AgentPickerScreen() {
	const router = useRouter();
	const theme = useTheme();
	const agentId = useNewSessionPreferencesStore((state) => state.agentId);
	const setAgentId = useNewSessionPreferencesStore((state) => state.setAgentId);
	const targetKey = useNewSessionPreferencesStore((state) => state.targetKey);
	const { targets, defaultTarget } = useNewChatTargets();
	const selectedTarget =
		targets.find((target) => target.key === targetKey) ?? defaultTarget;

	const configsQuery = useQuery({
		queryKey: ["host-agent-configs", selectedTarget?.machineId ?? null],
		enabled: selectedTarget !== null,
		staleTime: 60_000,
		networkMode: "always" as const,
		queryFn: async () => {
			if (!selectedTarget) return [];
			return getHostServiceClientByUrl(
				selectedTarget.hostUrl,
			).settings.agentConfigs.list.query();
		},
	});
	const configs = configsQuery.data ?? [];

	return (
		<ScrollView
			className="bg-background flex-1 px-6"
			contentContainerStyle={{ flexGrow: 1, paddingVertical: 8 }}
		>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button icon="xmark" onPress={() => router.back()} />
			</Stack.Toolbar>
			{configs.length === 0 ? (
				<Text
					className="py-6 text-center text-sm"
					style={{ color: theme.mutedForeground }}
				>
					{selectedTarget ? "Loading agents…" : "No projects on an online host"}
				</Text>
			) : null}
			{configs.map((config) => {
				// Persist the presetId, not the row id: config ids are per-host
				// UUIDs, presetIds resolve on any host (agents.run accepts both).
				const isSelected = config.presetId === agentId;
				return (
					<Pressable
						key={config.id}
						onPress={() => {
							setAgentId(config.presetId);
							router.back();
						}}
						className="flex-row items-center gap-2.5 py-2.5"
					>
						<AgentMark
							agentId={config.iconId ?? config.presetId}
							size={18}
							color={theme.mutedForeground}
						/>
						<Text
							className="flex-1 text-sm font-medium"
							style={{ color: theme.foreground }}
						>
							{config.label}
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

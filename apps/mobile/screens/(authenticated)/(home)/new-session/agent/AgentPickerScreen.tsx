import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SquareTerminal } from "lucide-react-native";
import { useMemo } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useHostsPresence } from "@/hooks/useHostsPresence";
import { useOrgHostsQuery } from "@/hooks/useOrgHosts";
import { useTheme } from "@/hooks/useTheme";
import { agentIconSource } from "@/lib/agent-icons";
import { hostServiceUrl } from "@/lib/host-service/client";
import { posthog } from "@/lib/posthog";
import { CLOUD_TARGET_ID } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/hooks/useNewChatTargets";
import { useNewSessionPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore";
import { useHostAgentConfigs } from "@/screens/(authenticated)/hooks/useHostAgentConfigs";

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
	const { machineId } = useLocalSearchParams<{ machineId?: string }>();

	const hostsQuery = useOrgHostsQuery();
	const host =
		machineId && machineId !== CLOUD_TARGET_ID
			? (hostsQuery.data?.find((entry) => entry.machineId === machineId) ??
				null)
			: null;
	const presenceTargets = useMemo(() => (host ? [host] : []), [host]);
	const presence = useHostsPresence(presenceTargets);
	const isOnline = host
		? (presence?.get(host.machineId) ?? host.isOnline)
		: false;

	const configsQuery = useHostAgentConfigs({
		machineId: host?.machineId ?? null,
		hostUrl:
			host && isOnline
				? hostServiceUrl(host.organizationId, host.machineId)
				: null,
	});
	const configs = configsQuery.data ?? [];

	let notice: string | null = null;
	let isLoading = false;
	let retry: (() => void) | null = null;
	if (!machineId) {
		notice = "No project selected";
	} else if (machineId === CLOUD_TARGET_ID) {
		notice = "Cloud workspaces don't run an agent yet";
	} else if (!host) {
		if (hostsQuery.isPending) {
			isLoading = true;
		} else if (hostsQuery.isError) {
			notice = "Could not load your machines";
			retry = () => void hostsQuery.refetch();
		} else {
			notice = "That machine is no longer available";
		}
	} else if (!isOnline) {
		notice = `${host.name} is offline`;
	} else if (configs.length === 0) {
		if (configsQuery.isError) {
			notice = `Could not load agents from ${host.name}`;
			retry = () => void configsQuery.refetch();
		} else if (configsQuery.isPending) {
			isLoading = true;
		} else {
			notice = `No agents configured on ${host.name}`;
		}
	}

	return (
		<ScrollView
			className="bg-background flex-1 px-6"
			contentContainerStyle={{ flexGrow: 1, paddingVertical: 8 }}
		>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button icon="xmark" onPress={() => router.back()} />
			</Stack.Toolbar>
			{isLoading ? (
				<View className="items-center py-8">
					<Spinner />
				</View>
			) : null}
			{notice ? (
				<View className="items-center gap-3 py-6">
					<Text
						className="text-center text-sm"
						style={{ color: theme.mutedForeground }}
					>
						{notice}
					</Text>
					{retry ? (
						<Button size="sm" variant="secondary" onPress={retry}>
							<Text>Try again</Text>
						</Button>
					) : null}
				</View>
			) : null}
			{notice === null &&
				configs.map((config) => {
					// Persist the presetId, not the row id: config ids are per-host
					// UUIDs, presetIds resolve on any host (agents.run accepts both).
					const isSelected = config.presetId === agentId;
					return (
						<Pressable
							key={config.id}
							onPress={() => {
								setAgentId(config.presetId);
								posthog.capture("new_session_agent_selected", {
									agent: config.presetId,
								});
								router.back();
							}}
							className="flex-row items-center gap-2.5 py-2.5"
							ph-label="new-session-agent-row"
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

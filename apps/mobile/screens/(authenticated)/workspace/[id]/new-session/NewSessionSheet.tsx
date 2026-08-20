import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SquareTerminal } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
import { getHostTerminalsQueryKey } from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { AgentMark } from "@/screens/(authenticated)/(home)/new-session/agent";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";

/**
 * Bottom sheet for the tab strip's + — the host's agent presets plus a plain
 * shell, each row launching a new session and landing on its tab.
 */
export function NewSessionSheet() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const theme = useTheme();
	const queryClient = useQueryClient();
	const { workspace, host } = useWorkspaceHost(id ?? null);
	const hostUrl = host
		? hostServiceUrl(host.organizationId, host.machineId)
		: null;

	const presetsQuery = useQuery({
		queryKey: ["host-agent-configs", host?.machineId ?? null],
		enabled: hostUrl !== null,
		staleTime: 60_000,
		networkMode: "always" as const,
		queryFn: async () => {
			if (!hostUrl) return [];
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.agentConfigs.list.query();
		},
	});
	const presets = presetsQuery.data ?? [];

	// The launching row shows a spinner; every row locks until the launch
	// resolves so a double-tap can't start two sessions.
	const [launchingKey, setLaunchingKey] = useState<string | null>(null);

	const launch = async (agentId: string | null) => {
		if (!workspace || !hostUrl || launchingKey !== null) return;
		setLaunchingKey(agentId ?? "shell");
		try {
			const client = getHostServiceClientByUrl(hostUrl);
			let terminalId: string;
			if (agentId === null) {
				const created = await client.terminal.createSession.mutate({
					workspaceId: workspace.id,
				});
				terminalId = created.terminalId;
			} else {
				const result = await client.agents.run.mutate({
					workspaceId: workspace.id,
					agent: agentId,
					prompt: "",
				});
				if (result.kind !== "terminal") {
					throw new Error(`${result.label} did not start a terminal session`);
				}
				terminalId = result.sessionId;
			}
			if (host) {
				void queryClient.invalidateQueries({
					queryKey: getHostTerminalsQueryKey(host.machineId),
				});
			}
			router.dismissTo(
				`/(authenticated)/workspace/${workspace.id}?tab=${terminalId}`,
			);
		} catch (error) {
			setLaunchingKey(null);
			Alert.alert(
				"Could not start session",
				error instanceof Error ? error.message : String(error),
			);
		}
	};

	const spinner = <ActivityIndicator size="small" />;

	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="px-5 pb-8"
			contentInsetAdjustmentBehavior="automatic"
		>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					icon="xmark"
					accessibilityLabel="Close"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			{presets.length === 0 ? (
				<View className="items-center py-8">
					{presetsQuery.isError ? (
						<Text className="text-muted-foreground text-sm">
							Could not load presets from the host.
						</Text>
					) : (
						spinner
					)}
				</View>
			) : null}
			{presets.map((preset) => (
				<ListRow
					key={preset.id}
					icon={
						<AgentMark
							agentId={preset.iconId ?? preset.presetId}
							size={19}
							color={theme.mutedForeground}
						/>
					}
					label={preset.label}
					trailing={launchingKey === preset.presetId ? spinner : undefined}
					onPress={() => void launch(preset.presetId)}
				/>
			))}
			{presets.length > 0 ? (
				<ListRow
					icon={<SquareTerminal size={19} color={theme.mutedForeground} />}
					label="Shell"
					trailing={launchingKey === "shell" ? spinner : undefined}
					onPress={() => void launch(null)}
					isLast
				/>
			) : null}
		</ScrollView>
	);
}

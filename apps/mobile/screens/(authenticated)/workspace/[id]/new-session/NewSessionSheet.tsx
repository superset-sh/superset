import { Trans, useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SquareTerminal } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { Button } from "@/components/ui/button";
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
import { useHostAgentConfigs } from "@/screens/(authenticated)/hooks/useHostAgentConfigs";

/**
 * Bottom sheet for the tab strip's + — the host's agent presets plus a plain
 * shell, each row launching a new session and landing on its tab.
 */
export function NewSessionSheet() {
	const { t } = useLingui();
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const theme = useTheme();
	const queryClient = useQueryClient();
	const { workspace, host, isResolving } = useWorkspaceHost(id ?? null);
	const hostUrl = host
		? hostServiceUrl(host.organizationId, host.machineId)
		: null;

	const presetsQuery = useHostAgentConfigs({
		machineId: host?.machineId ?? null,
		hostUrl,
	});
	const presets = presetsQuery.data ?? [];

	// The launching row shows a spinner; every row locks until the launch
	// resolves so a double-tap can't start two sessions.
	const [launchingKey, setLaunchingKey] = useState<string | null>(null);

	let notice: string | null = null;
	let isLoading = false;
	let canRetry = false;
	if (!host) {
		if (isResolving) isLoading = true;
		else
			notice = t({
				message: "Could not reach this workspace's machine",
			});
	} else if (presets.length === 0) {
		if (presetsQuery.isError) {
			notice = t({
				message: "Could not load presets from the host",
			});
			canRetry = true;
		} else if (presetsQuery.isPending) {
			isLoading = true;
		} else {
			notice = t({
				message: "No agents configured on this machine",
			});
		}
	}

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
				t({
					message: "Could not start session",
				}),
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
					accessibilityLabel={t({
						message: "Close",
					})}
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			{isLoading ? <View className="items-center py-8">{spinner}</View> : null}
			{notice ? (
				<View className="items-center gap-3 py-8">
					<Text className="text-muted-foreground text-sm">{notice}</Text>
					{canRetry ? (
						<Button
							size="sm"
							variant="secondary"
							onPress={() => void presetsQuery.refetch()}
						>
							<Text>
								<Trans>Try again</Trans>
							</Text>
						</Button>
					) : null}
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
					label={t({ message: "Shell" })}
					trailing={launchingKey === "shell" ? spinner : undefined}
					onPress={() => void launch(null)}
					isLast
				/>
			) : null}
		</ScrollView>
	);
}

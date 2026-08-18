import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useHostsPresence } from "@/hooks/useHostsPresence";
import { useOrgHosts } from "@/hooks/useOrgHosts";
import { useTheme } from "@/hooks/useTheme";
import {
	buildRelayHostUrl,
	getHostServiceClientByUrl,
} from "@/lib/host-service/client";
import { AgentMark } from "@/screens/(authenticated)/(home)/new-session/agent";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";

/**
 * Read-only view of each online host's agent presets — the entries the
 * new-session agent picker and the terminal + menu launch from. Editing
 * stays on desktop for now.
 */
export function PresetsScreen() {
	const theme = useTheme();
	const hosts = useOrgHosts();
	const presence = useHostsPresence(hosts);

	const onlineHosts = useMemo(
		() =>
			hosts
				.filter((host) => presence?.get(host.machineId) ?? host.isOnline)
				.sort((a, b) => a.name.localeCompare(b.name)),
		[hosts, presence],
	);

	const configQueries = useQueries({
		queries: onlineHosts.map((host) => ({
			queryKey: ["host-agent-configs", host.machineId],
			staleTime: 60_000,
			retry: 1,
			networkMode: "always" as const,
			queryFn: () =>
				getHostServiceClientByUrl(
					buildRelayHostUrl(host.organizationId, host.machineId),
				).settings.agentConfigs.list.query(),
		})),
	});

	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="px-6 pb-12"
		>
			{onlineHosts.length === 0 ? (
				<Text
					className="py-8 text-center text-sm"
					style={{ color: theme.mutedForeground }}
				>
					No hosts online
				</Text>
			) : null}
			{onlineHosts.map((host, index) => {
				const configs = configQueries[index]?.data ?? [];
				return (
					<View key={host.machineId}>
						<Text
							className="pb-1 pt-5 text-[12px] font-medium uppercase"
							style={{ color: theme.mutedForeground }}
						>
							{host.name}
						</Text>
						{configs.map((config, configIndex) => (
							<ListRow
								key={config.id}
								icon={
									<AgentMark
										agentId={config.iconId ?? config.presetId}
										size={18}
										color={theme.mutedForeground}
									/>
								}
								label={config.label}
								trailing={
									<Text
										className="text-sm"
										style={{ color: theme.mutedForeground }}
										numberOfLines={1}
									>
										{config.command}
									</Text>
								}
								isLast={configIndex === configs.length - 1}
							/>
						))}
					</View>
				);
			})}
		</ScrollView>
	);
}

import { COMPANY } from "@superset/shared/constants";
import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useHostsPresence } from "@/hooks/useHostsPresence";
import { NO_HOSTS, useOrgHostsQuery } from "@/hooks/useOrgHosts";
import { useTheme } from "@/hooks/useTheme";
import { openUrl } from "@/lib/open-url";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";

export function HostsSettingsScreen() {
	const theme = useTheme();
	const hostsQuery = useOrgHostsQuery();
	const hosts = hostsQuery.data ?? NO_HOSTS;
	const presence = useHostsPresence(hosts);

	const hostRows = useMemo(
		() =>
			hosts
				.map((host) => ({
					...host,
					isOnline: presence?.get(host.machineId) ?? host.isOnline,
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
		[hosts, presence],
	);

	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="px-6 pb-12"
		>
			{hostsQuery.isSuccess && hostRows.length === 0 ? (
				// Same dead end as the home screen's: a device only reaches the
				// relay once someone opts it in on a desktop, so an empty list here
				// is a setup step nobody has been told about. Only once the query
				// has answered — an empty list while it is pending is not an answer.
				<View className="items-center gap-4 py-16">
					<Text className="text-base font-medium text-foreground">
						No devices yet
					</Text>
					<Text
						className="text-center text-sm leading-5"
						style={{ color: theme.mutedForeground }}
					>
						In the Superset desktop app, open Settings → Security and turn on
						“Allow remote workspaces to access this device via relay”.
					</Text>
					<Button
						variant="secondary"
						onPress={() => openUrl(`${COMPANY.DOCS_URL}/remote-workspaces`)}
					>
						<Text>Read the setup guide</Text>
					</Button>
				</View>
			) : null}
			{hostRows.map((host, index) => (
				<ListRow
					key={host.machineId}
					icon={<HostStatusDot isOnline={host.isOnline} />}
					label={host.name}
					trailing={
						<Text className="text-sm" style={{ color: theme.mutedForeground }}>
							{host.isOnline ? "Online" : "Offline"}
						</Text>
					}
					isLast={index === hostRows.length - 1}
				/>
			))}
		</ScrollView>
	);
}

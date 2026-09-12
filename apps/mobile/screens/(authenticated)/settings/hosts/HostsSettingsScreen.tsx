import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useOrgHosts, useOrgHostsQuery } from "@/hooks/useOrgHosts";
import { useTheme } from "@/hooks/useTheme";
import { openUrl } from "@/lib/open-url";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";

export function HostsSettingsScreen() {
	const { t } = useLingui();
	const theme = useTheme();
	const hostsQuery = useOrgHostsQuery();
	const hosts = useOrgHosts();

	const hostRows = useMemo(
		() => [...hosts].sort((a, b) => a.name.localeCompare(b.name)),
		[hosts],
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
						<Trans>No devices yet</Trans>
					</Text>
					<Text
						className="text-center text-sm leading-5"
						style={{ color: theme.mutedForeground }}
					>
						<Trans>
							In the Superset desktop app, open Settings → Remote Access and
							turn on “Allow remote access to this device via relay”.
						</Trans>
					</Text>
					<Button
						variant="secondary"
						onPress={() => openUrl(`${COMPANY.DOCS_URL}/remote-access`)}
					>
						<Text>
							<Trans>Read the setup guide</Trans>
						</Text>
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
							{host.isOnline
								? t({ message: "Online" })
								: t({ message: "Offline" })}
						</Text>
					}
					isLast={index === hostRows.length - 1}
				/>
			))}
		</ScrollView>
	);
}

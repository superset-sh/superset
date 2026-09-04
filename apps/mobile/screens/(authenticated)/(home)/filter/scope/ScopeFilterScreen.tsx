import { useLingui } from "@lingui/react/macro";
import { useRouter } from "expo-router";
import { Cloud } from "lucide-react-native";
import { useMemo } from "react";
import { ScrollView } from "react-native";
import { Icon } from "@/components/ui/icon";
import { useHostsPresence } from "@/hooks/useHostsPresence";
import { useOrgHosts } from "@/hooks/useOrgHosts";
import { posthog } from "@/lib/posthog";
import { useWorkspacesFilterStore } from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import { useSelectedHost } from "@/screens/(authenticated)/(home)/hooks/useSelectedHost";
import {
	useCloudScopeEnabled,
	useWorkspaceScope,
} from "@/screens/(authenticated)/(home)/hooks/useWorkspaceScope";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { ListRowCheck } from "@/screens/(authenticated)/components/ListRowCheck";

/**
 * Where the list looks: one of your machines, or Cloud where that is enabled.
 * Cloud leads, and carries the cloud glyph rather than a status dot — it is a
 * place, not a computer that sleeps.
 */
export function ScopeFilterScreen() {
	const { t } = useLingui();
	const router = useRouter();
	const hosts = useOrgHosts();
	const selectedHost = useSelectedHost();
	const scope = useWorkspaceScope();
	const cloudEnabled = useCloudScopeEnabled();
	const setHostFilter = useWorkspacesFilterStore(
		(store) => store.setHostFilter,
	);
	const setScopeCloud = useWorkspacesFilterStore(
		(store) => store.setScopeCloud,
	);

	const presence = useHostsPresence(hosts);

	const sortedHosts = useMemo(
		() =>
			hosts
				.map((host) => ({
					...host,
					isOnline: presence?.get(host.machineId) ?? host.isOnline,
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
		[hosts, presence],
	);

	const selectHost = (machineId: string) => {
		setHostFilter(machineId);
		posthog.capture("filter_applied", { filter: "host", value: "machine" });
		router.back();
	};

	const selectCloud = () => {
		setScopeCloud();
		posthog.capture("filter_applied", { filter: "host", value: "cloud" });
		router.back();
	};

	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="px-6 pb-10"
		>
			{cloudEnabled ? (
				<ListRow
					icon={
						<Icon
							as={Cloud}
							className="text-muted-foreground size-4"
							strokeWidth={2}
						/>
					}
					label={t({ message: "Cloud" })}
					trailing={<ListRowCheck visible={scope === "cloud"} />}
					onPress={selectCloud}
					isLast={sortedHosts.length === 0}
				/>
			) : null}
			{sortedHosts.map((host, index) => (
				<ListRow
					key={host.machineId}
					icon={<HostStatusDot isOnline={host.isOnline} />}
					label={host.name}
					trailing={
						<ListRowCheck
							visible={
								scope === "host" && host.machineId === selectedHost?.machineId
							}
						/>
					}
					onPress={() => selectHost(host.machineId)}
					isLast={index === sortedHosts.length - 1}
				/>
			))}
		</ScrollView>
	);
}

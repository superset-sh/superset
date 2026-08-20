import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView } from "react-native";
import { useHostsPresence } from "@/hooks/useHostsPresence";
import { useOrgHosts } from "@/hooks/useOrgHosts";
import { useWorkspacesFilterStore } from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import { useSelectedHost } from "@/screens/(authenticated)/(home)/hooks/useSelectedHost";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { ListRowCheck } from "@/screens/(authenticated)/components/ListRowCheck";

export function HostFilterScreen() {
	const router = useRouter();
	const hosts = useOrgHosts();
	const selectedHost = useSelectedHost();
	const setHostFilter = useWorkspacesFilterStore(
		(store) => store.setHostFilter,
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
		router.back();
	};

	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="px-6 pb-10"
		>
			{sortedHosts.map((host, index) => (
				<ListRow
					key={host.machineId}
					icon={<HostStatusDot isOnline={host.isOnline} />}
					label={host.name}
					trailing={
						<ListRowCheck
							visible={host.machineId === selectedHost?.machineId}
						/>
					}
					onPress={() => selectHost(host.machineId)}
					isLast={index === sortedHosts.length - 1}
				/>
			))}
		</ScrollView>
	);
}

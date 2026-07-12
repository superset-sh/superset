import { useLiveQuery } from "@tanstack/react-db";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView } from "react-native";
import { useWorkspacesFilterStore } from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import { useSelectedHost } from "@/screens/(authenticated)/(home)/hooks/useSelectedHost";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { ListRowCheck } from "@/screens/(authenticated)/components/ListRowCheck";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";

export function HostFilterScreen() {
	const router = useRouter();
	const collections = useCollections();
	const selectedHost = useSelectedHost();
	const setHostFilter = useWorkspacesFilterStore(
		(store) => store.setHostFilter,
	);

	const { data: hosts } = useLiveQuery(
		(q) => q.from({ v2Hosts: collections.v2Hosts }),
		[collections],
	);

	const sortedHosts = useMemo(
		() => [...(hosts ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
		[hosts],
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

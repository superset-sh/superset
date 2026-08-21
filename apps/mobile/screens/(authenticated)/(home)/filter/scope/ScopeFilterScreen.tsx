import { useRouter } from "expo-router";
import { Cloud } from "lucide-react-native";
import { useMemo } from "react";
import { ScrollView } from "react-native";
import { Icon } from "@/components/ui/icon";
import { useCloudWorkspaceItems } from "@/hooks/useCloudWorkspaceItems";
import { useHostsPresence } from "@/hooks/useHostsPresence";
import { useOrgHosts } from "@/hooks/useOrgHosts";
import { useWorkspacesFilterStore } from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import { useSelectedHost } from "@/screens/(authenticated)/(home)/hooks/useSelectedHost";
import { useWorkspaceScope } from "@/screens/(authenticated)/(home)/hooks/useWorkspaceScope";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { ListRowCheck } from "@/screens/(authenticated)/components/ListRowCheck";

/**
 * Where the list looks: Cloud, or one of your machines. Cloud leads because it
 * answers whether any machine is awake, and it carries the cloud glyph rather
 * than a status dot — it is a place, not a computer that sleeps.
 */
export function ScopeFilterScreen() {
	const router = useRouter();
	const hosts = useOrgHosts();
	const selectedHost = useSelectedHost();
	const { items: cloudItems, isReady: cloudReady } = useCloudWorkspaceItems();
	const scope = useWorkspaceScope({
		isReady: cloudReady,
		count: cloudItems.length,
	});
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
		router.back();
	};

	const selectCloud = () => {
		setScopeCloud();
		router.back();
	};

	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="px-6 pb-10"
		>
			<ListRow
				icon={
					<Icon
						as={Cloud}
						className="text-muted-foreground size-4"
						strokeWidth={2}
					/>
				}
				label="Cloud"
				trailing={<ListRowCheck visible={scope === "cloud"} />}
				onPress={selectCloud}
				isLast={sortedHosts.length === 0}
			/>
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

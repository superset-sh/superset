import { useLiveQuery } from "@tanstack/react-db";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView, Text } from "react-native";
import { useHostWorkspaces } from "@/hooks/useHostWorkspaces";
import { useTheme } from "@/hooks/useTheme";
import { useWorkspacesFilterStore } from "@/screens/(authenticated)/(home)/workspaces/stores/workspacesFilterStore";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { ListRowCheck } from "@/screens/(authenticated)/components/ListRowCheck";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";

export function HostFilterScreen() {
	const router = useRouter();
	const theme = useTheme();
	const collections = useCollections();
	const { workspaces } = useHostWorkspaces();
	const hostFilter = useWorkspacesFilterStore((store) => store.hostFilter);
	const setHostFilter = useWorkspacesFilterStore(
		(store) => store.setHostFilter,
	);
	const projectFilter = useWorkspacesFilterStore(
		(store) => store.projectFilter,
	);

	const { data: hosts } = useLiveQuery(
		(q) => q.from({ v2Hosts: collections.v2Hosts }),
		[collections],
	);
	const { data: projects } = useLiveQuery(
		(q) => q.from({ v2Projects: collections.v2Projects }),
		[collections],
	);

	const selectedProjectId = useMemo(() => {
		if (projectFilter) return projectFilter;
		const sorted = [...(projects ?? [])].sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		return sorted[0]?.id ?? null;
	}, [projects, projectFilter]);

	const sortedHosts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const workspace of workspaces) {
			if (workspace.projectId !== selectedProjectId) continue;
			counts.set(workspace.hostId, (counts.get(workspace.hostId) ?? 0) + 1);
		}
		return (hosts ?? [])
			.map((host) => ({
				machineId: host.machineId,
				name: host.name,
				isOnline: host.isOnline,
				workspaceCount: counts.get(host.machineId) ?? 0,
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [hosts, workspaces, selectedProjectId]);

	const selectHost = (machineId: string | null) => {
		setHostFilter(machineId);
		router.back();
	};

	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="px-6 pb-10"
		>
			<ListRow
				label="All hosts"
				trailing={<ListRowCheck visible={hostFilter === null} />}
				onPress={() => selectHost(null)}
			/>
			{sortedHosts.map((host, index) => (
				<ListRow
					key={host.machineId}
					icon={<HostStatusDot isOnline={host.isOnline} />}
					label={host.name}
					trailing={
						<>
							<Text
								className="text-sm"
								style={{ color: theme.mutedForeground }}
							>
								{host.workspaceCount}
							</Text>
							<ListRowCheck visible={host.machineId === hostFilter} />
						</>
					}
					onPress={() => selectHost(host.machineId)}
					isLast={index === sortedHosts.length - 1}
				/>
			))}
		</ScrollView>
	);
}

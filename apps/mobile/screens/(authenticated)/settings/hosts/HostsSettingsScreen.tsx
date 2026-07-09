import { useLiveQuery } from "@tanstack/react-db";
import { formatDistanceToNow } from "date-fns";
import { useMemo } from "react";
import { ScrollView, Text } from "react-native";
import { useHostWorkspaces } from "@/hooks/useHostWorkspaces";
import { useTheme } from "@/hooks/useTheme";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";

export function HostsSettingsScreen() {
	const theme = useTheme();
	const collections = useCollections();
	const { workspaces } = useHostWorkspaces();

	const { data: hosts } = useLiveQuery(
		(q) => q.from({ v2Hosts: collections.v2Hosts }),
		[collections],
	);

	const hostRows = useMemo(() => {
		const counts = new Map<string, number>();
		for (const workspace of workspaces) {
			counts.set(workspace.hostId, (counts.get(workspace.hostId) ?? 0) + 1);
		}
		return [...(hosts ?? [])]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((host) => ({
				...host,
				workspaceCount: counts.get(host.machineId) ?? 0,
			}));
	}, [hosts, workspaces]);

	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="px-6 pb-12"
		>
			{hostRows.map((host, index) => (
				<ListRow
					key={host.machineId}
					icon={<HostStatusDot isOnline={host.isOnline} />}
					label={host.name}
					subtitle={`${host.workspaceCount} ${host.workspaceCount === 1 ? "workspace" : "workspaces"}`}
					trailing={
						<Text className="text-sm" style={{ color: theme.mutedForeground }}>
							{host.isOnline
								? "Online"
								: `Last seen ${formatDistanceToNow(host.updatedAt, { addSuffix: true })}`}
						</Text>
					}
					isLast={index === hostRows.length - 1}
				/>
			))}
		</ScrollView>
	);
}

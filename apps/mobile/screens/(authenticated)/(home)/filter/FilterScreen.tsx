import Ionicons from "@expo/vector-icons/Ionicons";
import { useLiveQuery } from "@tanstack/react-db";
import { Stack, useRouter } from "expo-router";
import { View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import {
	SORT_OPTIONS,
	useWorkspacesFilterStore,
} from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import { useSelectedHost } from "@/screens/(authenticated)/(home)/hooks/useSelectedHost";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { ListRowValue } from "@/screens/(authenticated)/components/ListRowValue";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { ProjectAvatar } from "./components/ProjectAvatar";

export function FilterScreen() {
	const router = useRouter();
	const theme = useTheme();
	const collections = useCollections();
	const projectFilter = useWorkspacesFilterStore(
		(store) => store.projectFilter,
	);
	const selectedHost = useSelectedHost();
	const sort = useWorkspacesFilterStore((store) => store.sort);

	const { data: projects } = useLiveQuery(
		(q) => q.from({ v2Projects: collections.v2Projects }),
		[collections],
	);

	const sortedProjects = [...(projects ?? [])].sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	const selectedProject =
		sortedProjects.find((project) => project.id === projectFilter) ??
		sortedProjects[0];
	const sortLabel =
		SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "";

	return (
		<View className="bg-background flex-1 px-6">
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button icon="xmark" onPress={() => router.back()} />
			</Stack.Toolbar>
			<ListRow
				icon={
					<Ionicons
						name="folder-outline"
						size={20}
						color={theme.mutedForeground}
					/>
				}
				label="Project"
				trailing={
					<ListRowValue
						value={selectedProject?.name ?? "All"}
						accessory={
							selectedProject ? (
								<ProjectAvatar
									name={selectedProject.name}
									iconUrl={selectedProject.iconUrl}
									size={22}
								/>
							) : undefined
						}
					/>
				}
				onPress={() => router.push("/(authenticated)/(home)/filter/project")}
			/>
			<ListRow
				icon={
					<Ionicons
						name="desktop-outline"
						size={20}
						color={theme.mutedForeground}
					/>
				}
				label="Host"
				trailing={
					<ListRowValue
						value={selectedHost?.name ?? ""}
						accessory={
							selectedHost ? (
								<HostStatusDot isOnline={selectedHost.isOnline} />
							) : undefined
						}
					/>
				}
				onPress={() => router.push("/(authenticated)/(home)/filter/host")}
			/>
			<ListRow
				icon={
					<Ionicons
						name="swap-vertical"
						size={20}
						color={theme.mutedForeground}
					/>
				}
				label="Sort"
				trailing={<ListRowValue value={sortLabel} />}
				onPress={() => router.push("/(authenticated)/(home)/filter/sort")}
				isLast
			/>
		</View>
	);
}

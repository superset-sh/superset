import { useLiveQuery } from "@tanstack/react-db";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView, Text } from "react-native";
import { useHostWorkspaces } from "@/hooks/useHostWorkspaces";
import { useTheme } from "@/hooks/useTheme";
import { useWorkspacesFilterStore } from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import { useSelectedHost } from "@/screens/(authenticated)/(home)/hooks/useSelectedHost";
import { ListRow } from "@/screens/(authenticated)/components/ListRow";
import { ListRowCheck } from "@/screens/(authenticated)/components/ListRowCheck";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { ProjectAvatar } from "../components/ProjectAvatar";

export function ProjectFilterScreen() {
	const router = useRouter();
	const theme = useTheme();
	const collections = useCollections();
	const selectedHost = useSelectedHost();
	const { workspaces } = useHostWorkspaces(selectedHost);
	const projectFilter = useWorkspacesFilterStore(
		(store) => store.projectFilter,
	);
	const setProjectFilter = useWorkspacesFilterStore(
		(store) => store.setProjectFilter,
	);

	const { data: projects } = useLiveQuery(
		(q) => q.from({ v2Projects: collections.v2Projects }),
		[collections],
	);

	const sortedProjects = useMemo(
		() => [...(projects ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
		[projects],
	);

	const workspaceCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const workspace of workspaces) {
			counts.set(
				workspace.projectId,
				(counts.get(workspace.projectId) ?? 0) + 1,
			);
		}
		return counts;
	}, [workspaces]);

	const selectedProjectId = projectFilter ?? sortedProjects[0]?.id ?? null;

	return (
		<ScrollView
			className="bg-background flex-1"
			contentContainerClassName="px-6 pb-10"
		>
			{sortedProjects.map((project, index) => (
				<ListRow
					key={project.id}
					icon={
						<ProjectAvatar
							name={project.name}
							iconUrl={project.iconUrl}
							size={28}
						/>
					}
					label={project.name}
					trailing={
						<>
							<Text
								className="text-sm"
								style={{ color: theme.mutedForeground }}
							>
								{workspaceCounts.get(project.id) ?? 0}
							</Text>
							<ListRowCheck visible={project.id === selectedProjectId} />
						</>
					}
					onPress={() => {
						setProjectFilter(project.id);
						router.back();
					}}
					isLast={index === sortedProjects.length - 1}
				/>
			))}
		</ScrollView>
	);
}

import { useLiveQuery } from "@tanstack/react-db";
import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { PaneCard } from "./components/PaneCard";
import { WorkspaceDetailSkeleton } from "./components/WorkspaceDetailSkeleton";

export function WorkspaceDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const collections = useCollections();

	const { data: projects, isLoading } = useLiveQuery(
		(q) => q.from({ projects: collections.projects }),
		[collections],
	);

	const project = projects?.find((p) => p.id === id);
	const title = project?.name ?? "Workspace";
	const repoLabel = project
		? `${project.repoOwner}/${project.repoName}`
		: undefined;

	return (
		<>
			{/* Native Stack header → swipe-back + 44pt back button (Jakob/Fitts). */}
			<Stack.Screen options={{ title }} />
			<ScrollView
				className="flex-1 bg-background"
				contentInsetAdjustmentBehavior="automatic"
			>
				<View className="p-4 gap-4">
					{isLoading ? (
						<WorkspaceDetailSkeleton />
					) : (
						<>
							{repoLabel ? (
								<Text className="text-sm text-muted-foreground px-2">
									{repoLabel} · {project?.defaultBranch}
								</Text>
							) : null}
							<PaneCard
								index={0}
								title="Branch Info"
								description="Working branch and recent commits"
							>
								<Text className="text-muted-foreground">
									Branch details will appear here
								</Text>
							</PaneCard>
							<PaneCard
								index={1}
								title="Claude Session"
								description="Live agent activity"
							>
								<Text className="text-muted-foreground">
									Active Claude session info will appear here
								</Text>
							</PaneCard>
							<PaneCard index={2} title="Terminal" description="Output stream">
								<Text className="text-muted-foreground">
									Terminal output will appear here
								</Text>
							</PaneCard>
						</>
					)}
				</View>
			</ScrollView>
		</>
	);
}

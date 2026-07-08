import type { SelectV2Workspace } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { compareDesc } from "date-fns";
import { Stack, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { THEME } from "@/lib/theme";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";

export function SearchScreen() {
	const router = useRouter();
	const collections = useCollections();
	const [query, setQuery] = useState("");

	const { data: workspaces, isReady: workspacesReady } = useLiveQuery(
		(q) => q.from({ v2Workspaces: collections.v2Workspaces }),
		[collections],
	);
	const { data: projects } = useLiveQuery(
		(q) => q.from({ v2Projects: collections.v2Projects }),
		[collections],
	);

	const results = useMemo<SelectV2Workspace[]>(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return [];
		const projectNames = new Map(
			(projects ?? []).map((project) => [project.id, project.name]),
		);
		return (workspaces ?? [])
			.filter(
				(workspace) =>
					workspace.name.toLowerCase().includes(needle) ||
					workspace.branch.toLowerCase().includes(needle) ||
					(projectNames.get(workspace.projectId) ?? "")
						.toLowerCase()
						.includes(needle),
			)
			.sort((a, b) => compareDesc(a.updatedAt, b.updatedAt))
			.slice(0, 50);
	}, [workspaces, projects, query]);

	return (
		<>
			<Stack.SearchBar
				autoFocus
				hideNavigationBar={false}
				placeholder="Search workspaces"
				placement="integrated"
				allowToolbarIntegration
				textColor={THEME.dark.foreground}
				hintTextColor={THEME.dark.mutedForeground}
				tintColor={THEME.dark.foreground}
				onChangeText={(event) => setQuery(event.nativeEvent.text)}
				onCancelButtonPress={() => setQuery("")}
			/>
			<FlatList
				className="flex-1 bg-background"
				contentInsetAdjustmentBehavior="automatic"
				data={results}
				keyExtractor={(item) => item.id}
				contentContainerClassName="p-4 pb-28 gap-2"
				keyboardDismissMode="on-drag"
				ListEmptyComponent={
					query.trim() && !workspacesReady ? null : (
						<View className="items-center justify-center py-20">
							<Text className="text-center text-muted-foreground">
								{query.trim()
									? "No workspaces match your search"
									: "Search your workspaces by name, branch, or project"}
							</Text>
						</View>
					)
				}
				renderItem={({ item }) => (
					<Pressable
						className="bg-card border-border active:bg-accent rounded-xl border p-4"
						onPress={() =>
							router.push(`/(authenticated)/workspace/${item.id}/chat`)
						}
					>
						<Text className="font-medium" numberOfLines={1}>
							{item.name}
						</Text>
						<Text
							className="text-muted-foreground mt-1 font-mono text-xs"
							numberOfLines={1}
						>
							{item.branch}
						</Text>
					</Pressable>
				)}
			/>
		</>
	);
}

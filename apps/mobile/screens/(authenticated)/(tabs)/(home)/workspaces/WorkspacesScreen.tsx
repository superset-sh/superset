import { LegendList } from "@legendapp/list/react-native";
import type {
	SelectGithubPullRequest,
	SelectV2Workspace,
} from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { Stack, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useOrganizations } from "@/screens/(authenticated)/hooks/useOrganizations";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { OrganizationHeaderButton } from "./components/OrganizationHeaderButton";
import { OrganizationSwitcherSheet } from "./components/OrganizationSwitcherSheet";
import { ProjectAvatar } from "./components/ProjectAvatar";
import {
	type FilterableProject,
	WorkspaceFilterSheet,
	type WorkspaceSort,
} from "./components/WorkspaceFilterSheet";
import { WorkspaceRow } from "./components/WorkspaceRow";

export function WorkspacesScreen() {
	const router = useRouter();
	const [sheetOpen, setSheetOpen] = useState(false);
	const [filterSheetOpen, setFilterSheetOpen] = useState(false);
	const [projectFilter, setProjectFilter] = useState<string | null>(null);
	const [sort, setSort] = useState<WorkspaceSort>("updatedAt");
	const { width } = useWindowDimensions();
	const collections = useCollections();
	const {
		organizations,
		activeOrganization,
		activeOrganizationId,
		switchOrganization,
	} = useOrganizations();

	const { data: workspaces } = useLiveQuery(
		(q) => q.from({ v2Workspaces: collections.v2Workspaces }),
		[collections],
	);
	const { data: projects } = useLiveQuery(
		(q) => q.from({ v2Projects: collections.v2Projects }),
		[collections],
	);
	const { data: pullRequests } = useLiveQuery(
		(q) => q.from({ githubPullRequests: collections.githubPullRequests }),
		[collections],
	);
	const { data: users } = useLiveQuery(
		(q) => q.from({ users: collections.users }),
		[collections],
	);

	const sortedProjects = useMemo(
		() => [...(projects ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
		[projects],
	);

	const filterableProjects = useMemo<FilterableProject[]>(() => {
		const counts = new Map<string, number>();
		for (const workspace of workspaces ?? []) {
			counts.set(
				workspace.projectId,
				(counts.get(workspace.projectId) ?? 0) + 1,
			);
		}
		return sortedProjects.map((project) => ({
			id: project.id,
			name: project.name,
			iconUrl: project.iconUrl,
			workspaceCount: counts.get(project.id) ?? 0,
		}));
	}, [sortedProjects, workspaces]);

	const selectedProjectId = projectFilter ?? sortedProjects[0]?.id ?? null;
	const selectedProject = sortedProjects.find(
		(project) => project.id === selectedProjectId,
	);

	const visibleWorkspaces = useMemo<SelectV2Workspace[]>(() => {
		return (workspaces ?? [])
			.filter((workspace) => workspace.projectId === selectedProjectId)
			.sort(
				(a, b) => new Date(b[sort]).getTime() - new Date(a[sort]).getTime(),
			);
	}, [workspaces, selectedProjectId, sort]);

	const pullRequestsByBranch = useMemo(() => {
		const byBranch = new Map<string, SelectGithubPullRequest>();
		const rank = (state: string) =>
			state === "open" ? 2 : state === "merged" ? 1 : 0;
		for (const pullRequest of pullRequests ?? []) {
			const existing = byBranch.get(pullRequest.headBranch);
			if (!existing || rank(pullRequest.state) > rank(existing.state)) {
				byBranch.set(pullRequest.headBranch, pullRequest);
			}
		}
		return byBranch;
	}, [pullRequests]);

	const usersById = useMemo(
		() => new Map((users ?? []).map((user) => [user.id, user])),
		[users],
	);

	const renderItem = useCallback(
		({ item }: { item: SelectV2Workspace }) => (
			<WorkspaceRow
				workspace={item}
				pullRequest={pullRequestsByBranch.get(item.branch)}
				creator={
					item.createdByUserId ? usersById.get(item.createdByUserId) : undefined
				}
				onPress={() =>
					router.push(`/(authenticated)/workspace/${item.id}/chat`)
				}
			/>
		),
		[pullRequestsByBranch, usersById, router],
	);

	const handleSwitchOrganization = (organizationId: string) => {
		setSheetOpen(false);
		switchOrganization(organizationId);
	};

	return (
		<>
			<OrganizationHeaderButton
				name={activeOrganization?.name}
				logo={activeOrganization?.logo}
				onPress={() => setSheetOpen(true)}
			/>
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button icon="square.and.pencil" onPress={() => {}} />
				<Stack.Toolbar.View>
					<Pressable
						hitSlop={8}
						onPress={() => setFilterSheetOpen(true)}
						style={{ height: 24, width: 24 }}
					>
						<ProjectAvatar
							name={selectedProject?.name}
							iconUrl={selectedProject?.iconUrl}
							size={24}
						/>
					</Pressable>
				</Stack.Toolbar.View>
			</Stack.Toolbar>
			<LegendList
				className="flex-1 bg-background"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{ paddingBottom: 112, paddingVertical: 8 }}
				data={visibleWorkspaces}
				extraData={renderItem}
				keyExtractor={(item: SelectV2Workspace) => item.id}
				renderItem={renderItem}
				ListEmptyComponent={
					<View className="items-center justify-center py-20">
						<Text className="text-center text-muted-foreground">
							No workspaces in this project yet
						</Text>
					</View>
				}
			/>
			<OrganizationSwitcherSheet
				isPresented={sheetOpen}
				onIsPresentedChange={setSheetOpen}
				organizations={organizations}
				activeOrganizationId={activeOrganizationId}
				onSwitchOrganization={handleSwitchOrganization}
				width={width}
			/>
			<WorkspaceFilterSheet
				isPresented={filterSheetOpen}
				onIsPresentedChange={setFilterSheetOpen}
				projects={filterableProjects}
				selectedProjectId={selectedProjectId}
				onSelectProject={(projectId) => {
					setProjectFilter(projectId);
					setFilterSheetOpen(false);
				}}
				sort={sort}
				onChangeSort={setSort}
				width={width}
			/>
		</>
	);
}

import { Plural, useLingui } from "@lingui/react/macro";
import {
	type NativeStackNavigationProp,
	Stack,
	useNavigation,
	useRouter,
} from "expo-router";
import { FolderGit2 } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import type { SearchBarCommands } from "react-native-screens";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCloudWorkspaceItems } from "@/hooks/useCloudWorkspaceItems";
import { useHostProjects } from "@/hooks/useHostProjects";
import {
	type HostWorkspaceItem,
	useHostWorkspaces,
} from "@/hooks/useHostWorkspaces";
import { useTheme } from "@/hooks/useTheme";
import {
	type TerminalsHost,
	useHostsTerminals,
} from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { useWorkspacesFilterStore } from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import { useSelectedHost } from "@/screens/(authenticated)/(home)/hooks/useSelectedHost";
import { useWorkspaceScope } from "@/screens/(authenticated)/(home)/hooks/useWorkspaceScope";
import { usePinnedWorkspacesStore } from "@/screens/(authenticated)/stores/pinnedWorkspacesStore";

/**
 * The native search bar lives in this sheet, not on the home screen: on a
 * root screen, activating a UISearchController on iOS 26 lays an invisible
 * view over the content that swallows every touch (#6659, unfixed through
 * react-native-screens 4.27 / iOS 26.5). On a formSheet's own header the same bar activates
 * properly — results tap, search dismisses (verified iOS 26.0). A nested
 * Stack inside the sheet never activates the controller, so no cancel ✕.
 *
 * The pool mirrors the home list's scope: the selected machine's workspaces,
 * or Cloud's sandboxes — the workspace query is per-host, so other machines
 * aren't in memory to search. The count row says which pool answered.
 */
export function SearchScreen() {
	const { t } = useLingui();
	const router = useRouter();
	const navigation =
		useNavigation<NativeStackNavigationProp<Record<string, undefined>>>();
	const theme = useTheme();
	const searchBarRef = useRef<SearchBarCommands>(null);
	const [query, setQuery] = useState("");
	const sort = useWorkspacesFilterStore((store) => store.sort);
	const selectedHost = useSelectedHost();
	const cloudScope = useWorkspaceScope() === "cloud";
	const { workspaces } = useHostWorkspaces(selectedHost);
	const { items: cloudItems, targets: sandboxes } = useCloudWorkspaceItems();
	const { projects } = useHostProjects(selectedHost);
	const pinnedAt = usePinnedWorkspacesStore((state) => state.pinnedAt);

	// Same hosts the home list polls, so the query keys are shared and the
	// sheet decorates from cache instead of paying its own fan-out.
	const terminalHosts = useMemo<TerminalsHost[]>(
		() =>
			cloudScope
				? sandboxes.map((sandbox) => ({
						organizationId: sandbox.organizationId,
						machineId: sandbox.workspaceId,
						isOnline: true,
						refetchIntervalMs: 30_000,
					}))
				: selectedHost
					? [selectedHost]
					: [],
		[selectedHost, sandboxes, cloudScope],
	);
	const { terminalsByWorkspace } = useHostsTerminals(terminalHosts);

	const projectNamesById = useMemo(
		() => new Map(projects.map((project) => [project.id, project.name])),
		[projects],
	);

	const matchesQuery = useCallback(
		(workspace: HostWorkspaceItem) => {
			const needle = query.trim().toLowerCase();
			if (!needle) return true;
			const sessions = terminalsByWorkspace.get(workspace.id) ?? [];
			return (
				workspace.name.toLowerCase().includes(needle) ||
				workspace.branch.toLowerCase().includes(needle) ||
				(
					(workspace.projectId
						? projectNamesById.get(workspace.projectId)
						: undefined) ?? ""
				)
					.toLowerCase()
					.includes(needle) ||
				sessions.some((row) => row.title.toLowerCase().includes(needle))
			);
		},
		[query, projectNamesById, terminalsByWorkspace],
	);

	const activityTs = useCallback(
		(workspace: HostWorkspaceItem) => {
			const workspaceTs = new Date(workspace[sort]).getTime();
			if (sort !== "updatedAt") return workspaceTs;
			const terminalTs = (terminalsByWorkspace.get(workspace.id) ?? []).reduce(
				(newest, row) => Math.max(newest, row.ts),
				0,
			);
			return Math.max(workspaceTs, terminalTs);
		},
		[sort, terminalsByWorkspace],
	);

	const byPinThenActivity = useCallback(
		(a: HostWorkspaceItem, b: HostWorkspaceItem) => {
			const aPin = pinnedAt[a.id];
			const bPin = pinnedAt[b.id];
			if (aPin !== undefined || bPin !== undefined) {
				if (aPin === undefined) return 1;
				if (bPin === undefined) return -1;
				return aPin - bPin;
			}
			return activityTs(b) - activityTs(a);
		},
		[pinnedAt, activityTs],
	);

	const results = useMemo(() => {
		const pool = cloudScope
			? cloudItems
			: workspaces.filter(
					(workspace) =>
						workspace.worktreeExists !== false &&
						workspace.hostId === selectedHost?.machineId,
				);
		return pool.filter(matchesQuery).sort(byPinThenActivity);
	}, [
		cloudScope,
		cloudItems,
		workspaces,
		selectedHost,
		matchesQuery,
		byPinThenActivity,
	]);

	const searching = query.trim().length > 0;

	// `autoFocus` is Android-only in react-native-screens. Focusing at mount
	// lands on a bar the sheet has not installed in its header yet, so wait
	// for the presentation to finish.
	useEffect(
		() =>
			navigation.addListener("transitionEnd", (event) => {
				if (!event.data.closing) searchBarRef.current?.focus();
			}),
		[navigation],
	);

	const open = useCallback(
		(workspace: HostWorkspaceItem) => {
			// A push alone would land behind this sheet — the modal sits above
			// the whole stack — so close first; the routing queue keeps order.
			router.back();
			router.push(`/(authenticated)/workspace/${workspace.id}`);
		},
		[router],
	);

	return (
		<>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					icon="xmark"
					accessibilityLabel={t({
						message: "Close",
					})}
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			<Stack.SearchBar
				ref={searchBarRef}
				placeholder={t({
					message: "Search workspaces",
				})}
				placement="stacked"
				hideWhenScrolling={false}
				hideNavigationBar={false}
				obscureBackground={false}
				textColor={theme.foreground}
				hintTextColor={theme.mutedForeground}
				tintColor={theme.foreground}
				onChangeText={(event) => setQuery(event.nativeEvent.text)}
				onCancelButtonPress={() => setQuery("")}
			/>
			<FlatList
				className="bg-background"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerClassName="pb-8"
				data={results}
				keyExtractor={(workspace) => workspace.id}
				keyboardDismissMode="on-drag"
				keyboardShouldPersistTaps="handled"
				ListHeaderComponent={
					searching ? (
						<Text className="text-muted-foreground px-4 pb-1 pt-2 font-semibold text-xs">
							{cloudScope ? (
								<Plural
									value={results.length}
									one="# result in Cloud"
									other="# results in Cloud"
								/>
							) : (
								<Plural
									value={results.length}
									one="# result on this host"
									other="# results on this host"
								/>
							)}
						</Text>
					) : null
				}
				renderItem={({ item: workspace }) => {
					const projectName = workspace.projectId
						? projectNamesById.get(workspace.projectId)
						: undefined;
					return (
						<Pressable
							className="flex-row items-center gap-3 px-4 py-2.5"
							onPress={() => open(workspace)}
							ph-label="search-workspace-row"
						>
							<View className="size-6 items-center justify-center">
								<Icon
									as={FolderGit2}
									className="text-muted-foreground size-5"
									strokeWidth={1.75}
								/>
							</View>
							<View className="min-w-0 flex-1">
								<Text className="font-semibold text-[14px]" numberOfLines={1}>
									{workspace.name}
								</Text>
								<Text
									className="text-muted-foreground text-[11.5px]"
									numberOfLines={1}
								>
									{projectName
										? `${projectName} · ${workspace.branch}`
										: workspace.branch}
								</Text>
							</View>
						</Pressable>
					);
				}}
				ListEmptyComponent={
					<View className="items-center py-16">
						<Text className="text-muted-foreground text-sm">
							{searching
								? t({
										message: "No workspaces match your search",
									})
								: cloudScope
									? t({
											message: "No cloud workspaces yet",
										})
									: t({
											message: "No workspaces on this host yet",
										})}
						</Text>
					</View>
				}
			/>
		</>
	);
}

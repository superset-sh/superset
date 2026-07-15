import { LegendList } from "@legendapp/list/react-native";
import { prompt } from "@superset/alert-prompt";
import { useQueries } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Circle,
	FileDiff,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
	ActionSheetIOS,
	ActivityIndicator,
	RefreshControl,
	View,
} from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { cn } from "@/lib/utils";
import { useStartWorkspaceChat } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/hooks/useStartWorkspaceChat";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import {
	type ChangesetFile,
	useWorkspaceChangeset,
} from "../hooks/useWorkspaceChangeset";
import { useViewedFilesStore } from "./stores/viewedFilesStore";
import { computeFileDiff, type DiffRow } from "./utils/computeFileDiff";

const AUTO_EXPAND_MAX_FILES = 15;

// Stable fallback: an inline `?? []` makes the zustand snapshot a fresh array
// every read, which useSyncExternalStore treats as an endless store change.
const NO_VIEWED_PATHS: string[] = [];

type ListItem =
	| { kind: "summary" }
	| { kind: "file"; file: ChangesetFile; expanded: boolean; viewed: boolean }
	| { kind: "diff-row"; row: DiffRow }
	| { kind: "note"; key: string; note: "loading" | "error" | "binary" };

function itemKey(item: ListItem): string {
	switch (item.kind) {
		case "summary":
			return "summary";
		case "file":
			return `file:${item.file.path}`;
		case "diff-row":
			return item.row.key;
		case "note":
			return item.key;
	}
}

function splitPath(path: string): { name: string; dir: string | null } {
	const separator = path.lastIndexOf("/");
	if (separator === -1) return { name: path, dir: null };
	return {
		name: path.slice(separator + 1),
		dir: path.slice(0, separator),
	};
}

const LINE_TEXT_CLASS = {
	add: "text-green-500",
	del: "text-red-500",
	context: "text-foreground/80",
} as const;

const LINE_BG_CLASS = {
	add: "bg-green-500/10",
	del: "bg-red-500/10",
	context: undefined,
} as const;

const LINE_SIGN = { add: "+", del: "−", context: " " } as const;

function DiffRowView({ row }: { row: DiffRow }) {
	if (row.kind === "hunk") {
		return (
			<View className="bg-muted/40 px-3 py-1">
				<Text className="text-muted-foreground font-mono text-[11px]">
					{row.header}
				</Text>
			</View>
		);
	}
	if (row.kind === "truncated") {
		return (
			<View className="items-center px-3 py-2">
				<Text className="text-muted-foreground text-xs">
					Diff truncated — {row.hiddenCount} more lines on the host
				</Text>
			</View>
		);
	}
	return (
		<View className={cn("flex-row", LINE_BG_CLASS[row.type])}>
			<Text className="text-muted-foreground/50 w-10 pr-1.5 text-right font-mono text-[11px] leading-5">
				{row.newLineNumber ?? row.oldLineNumber ?? ""}
			</Text>
			<Text
				className={cn(
					"w-3.5 font-mono text-[11px] leading-5",
					LINE_TEXT_CLASS[row.type],
				)}
			>
				{LINE_SIGN[row.type]}
			</Text>
			<Text
				className={cn(
					"flex-1 pr-2 font-mono text-[11px] leading-5",
					LINE_TEXT_CLASS[row.type],
				)}
				numberOfLines={1}
			>
				{row.text}
			</Text>
		</View>
	);
}

export function FilesChangedScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const workspaceId = id ?? null;

	const changeset = useWorkspaceChangeset(workspaceId);
	const { workspace } = useWorkspaceHost(workspaceId);
	const [collapsedPaths, setCollapsedPaths] = useState<ReadonlySet<string>>(
		new Set(),
	);
	const [refreshing, setRefreshing] = useState(false);

	const viewedPaths = useViewedFilesStore(
		(state) => state.viewedByWorkspace[workspaceId ?? ""] ?? NO_VIEWED_PATHS,
	);
	const toggleViewed = useViewedFilesStore((state) => state.toggleViewed);
	const viewedSet = useMemo(() => new Set(viewedPaths), [viewedPaths]);

	const widgetWorkspaces = useMemo<HostWorkspaceItem[]>(
		() => (workspace ? [{ ...workspace, hostReachable: true }] : []),
		[workspace],
	);
	const startWorkspaceChat = useStartWorkspaceChat(widgetWorkspaces);

	const toggleCollapsed = useCallback((path: string) => {
		setCollapsedPaths((previous) => {
			const next = new Set(previous);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	}, []);

	// Above this, every expanded file firing a full-contents git.getDiff on
	// first open stampedes the relay; large changesets rest collapsed instead.
	const autoCollapse = changeset.files.length > AUTO_EXPAND_MAX_FILES;

	const isExpanded = useCallback(
		(file: ChangesetFile) => {
			// Viewed files (and every file of a large changeset) rest collapsed; a
			// manual toggle overrides either way.
			const restingCollapsed = autoCollapse || viewedSet.has(file.path);
			const toggled = collapsedPaths.has(file.path);
			return restingCollapsed ? toggled : !toggled;
		},
		[autoCollapse, viewedSet, collapsedPaths],
	);

	const expandedFiles = useMemo(
		() =>
			changeset.files.filter(
				(file) => isExpanded(file) && file.isBinary !== true,
			),
		[changeset.files, isExpanded],
	);

	const diffQueries = useQueries({
		queries: expandedFiles.map((file) => ({
			// The per-file stats change with the file's contents, so a fresh edit
			// busts the otherwise-immortal cache entry.
			queryKey: [
				"workspace-file-diff-rows",
				workspaceId,
				file.source,
				file.path,
				file.additions,
				file.deletions,
			] as const,
			enabled: changeset.hostUrl !== null,
			staleTime: Number.POSITIVE_INFINITY,
			retry: 1,
			networkMode: "always" as const,
			queryFn: async () => {
				const pair = await getHostServiceClientByUrl(
					changeset.hostUrl as string,
				).git.getDiff.query({
					workspaceId: workspaceId as string,
					path: file.path,
					category: file.source,
				});
				return computeFileDiff(
					file.path,
					pair.oldFile.contents ?? "",
					pair.newFile.contents ?? "",
				);
			},
		})),
	});

	const rowsByPath = useMemo(() => {
		const map = new Map<string, { rows: DiffRow[] | null; isError: boolean }>();
		expandedFiles.forEach((file, index) => {
			const query = diffQueries[index];
			map.set(file.path, {
				rows: query?.data ?? null,
				isError: query?.isError ?? false,
			});
		});
		return map;
	}, [expandedFiles, diffQueries]);

	const addFileComment = useCallback(
		async (file: ChangesetFile) => {
			if (!workspace) return;
			const comment = await prompt({
				title: file.path.split("/").pop() ?? file.path,
				confirmText: "Send",
			});
			const trimmed = comment?.trim();
			if (!trimmed) return;
			startWorkspaceChat.mutate({
				target: {
					workspaceId: workspace.id,
					workspaceName: workspace.name,
					branch: workspace.branch,
					hostId: workspace.hostId,
				},
				message: {
					text: `Regarding \`${file.path}\`:\n\n${trimmed}`,
					attachments: [],
				},
			});
		},
		[workspace, startWorkspaceChat],
	);

	const openFileMenu = useCallback(
		(file: ChangesetFile) => {
			void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
			ActionSheetIOS.showActionSheetWithOptions(
				{
					title: file.path,
					options: ["View file", "Add file comment", "Copy path", "Cancel"],
					cancelButtonIndex: 3,
				},
				(buttonIndex) => {
					switch (buttonIndex) {
						case 0:
							router.push(
								`/(authenticated)/workspace/${workspaceId}/file?path=${encodeURIComponent(file.path)}&source=${file.source}`,
							);
							return;
						case 1:
							void addFileComment(file);
							return;
						case 2:
							void Clipboard.setStringAsync(file.path);
							return;
					}
				},
			);
		},
		[router, workspaceId, addFileComment],
	);

	const items = useMemo<ListItem[]>(() => {
		const result: ListItem[] = [{ kind: "summary" }];
		for (const file of changeset.files) {
			const expanded = isExpanded(file);
			result.push({
				kind: "file",
				file,
				expanded,
				viewed: viewedSet.has(file.path),
			});
			if (!expanded) continue;
			if (file.isBinary === true) {
				result.push({
					kind: "note",
					key: `${file.path}:binary`,
					note: "binary",
				});
				continue;
			}
			const diff = rowsByPath.get(file.path);
			if (diff?.rows) {
				for (const row of diff.rows) result.push({ kind: "diff-row", row });
			} else {
				result.push({
					kind: "note",
					key: `${file.path}:${diff?.isError ? "error" : "loading"}`,
					note: diff?.isError ? "error" : "loading",
				});
			}
		}
		return result;
	}, [changeset.files, isExpanded, viewedSet, rowsByPath]);

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		try {
			await changeset.refetch();
		} finally {
			setRefreshing(false);
		}
	}, [changeset.refetch]);

	const renderItem = useCallback(
		({ item }: { item: ListItem }) => {
			switch (item.kind) {
				case "summary":
					return (
						<View className="flex-row items-center gap-1.5 px-4 pb-3 pt-1">
							<Text className="text-green-500 font-semibold text-[15px]">
								+{changeset.additions}
							</Text>
							<Text className="text-red-500 font-semibold text-[15px]">
								−{changeset.deletions}
							</Text>
							<Text className="text-muted-foreground text-[15px]">
								·{" "}
								{changeset.files.length === 1
									? "1 file"
									: `${changeset.files.length} files`}
							</Text>
						</View>
					);
				case "file": {
					const { name, dir } = splitPath(item.file.path);
					return (
						<PressableScale
							className={cn(
								"bg-background border-border/60 flex-row items-center gap-2.5 border-t px-4 py-3",
								item.viewed && "opacity-55",
							)}
							onPress={() => toggleCollapsed(item.file.path)}
							onLongPress={() => openFileMenu(item.file)}
						>
							<Icon
								as={item.expanded ? ChevronDown : ChevronRight}
								className="text-muted-foreground size-4"
							/>
							<Text className="font-semibold text-[14px]" numberOfLines={1}>
								{name}
							</Text>
							{dir ? (
								<Text
									className="text-muted-foreground min-w-0 flex-1 text-[12px]"
									numberOfLines={1}
								>
									{dir}
								</Text>
							) : (
								<View className="flex-1" />
							)}
							<View className="flex-row items-center gap-1">
								<Text className="text-green-500 font-medium text-[12px]">
									+{item.file.additions}
								</Text>
								<Text className="text-red-500 font-medium text-[12px]">
									−{item.file.deletions}
								</Text>
							</View>
							<PressableScale
								accessibilityLabel={
									item.viewed ? "Mark as not viewed" : "Mark as viewed"
								}
								hitSlop={8}
								onPress={() => {
									void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
									if (workspaceId) toggleViewed(workspaceId, item.file.path);
								}}
							>
								<Icon
									as={item.viewed ? CheckCircle2 : Circle}
									className={cn(
										"size-5",
										item.viewed ? "text-green-500" : "text-muted-foreground/50",
									)}
									strokeWidth={1.75}
								/>
							</PressableScale>
						</PressableScale>
					);
				}
				case "diff-row":
					return <DiffRowView row={item.row} />;
				case "note":
					return (
						<View className="items-center px-4 py-4">
							{item.note === "loading" ? (
								<ActivityIndicator />
							) : (
								<Text className="text-muted-foreground text-xs">
									{item.note === "binary"
										? "Binary file changed"
										: "Could not load this diff"}
								</Text>
							)}
						</View>
					);
			}
		},
		[
			changeset.additions,
			changeset.deletions,
			changeset.files.length,
			toggleCollapsed,
			toggleViewed,
			openFileMenu,
			workspaceId,
		],
	);

	return (
		<LegendList
			className="bg-background flex-1"
			contentInsetAdjustmentBehavior="automatic"
			contentContainerStyle={{ paddingBottom: 48, paddingTop: 8 }}
			data={items}
			extraData={renderItem}
			keyExtractor={itemKey}
			renderItem={renderItem}
			refreshControl={
				<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
			}
			ListEmptyComponent={null}
			ListFooterComponent={
				changeset.isReady && changeset.files.length === 0 ? (
					<View className="items-center gap-2 px-10 py-20">
						<Icon
							as={FileDiff}
							className="text-muted-foreground/50 size-10"
							strokeWidth={1.4}
						/>
						<Text className="text-muted-foreground text-center text-sm">
							No changes on this branch yet.
						</Text>
					</View>
				) : null
			}
		/>
	);
}

import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { FileDiff } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActionSheetIOS,
	ActivityIndicator,
	Alert,
	Linking,
	PanResponder,
	RefreshControl,
	Share,
	useWindowDimensions,
	View,
} from "react-native";
import { useSharedValue, withDecay } from "react-native-reanimated";
import { tokenizeCode } from "@/components/ai-elements/code-block";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import {
	type ChangesetFile,
	useWorkspaceChangeset,
} from "../hooks/useWorkspaceChangeset";
import { useWorkspacePullRequest } from "../hooks/useWorkspacePullRequest";
import { useCommentComposerStore } from "../stores/commentComposerStore";
import { NO_EXPANSIONS, useDiffViewStore } from "../stores/diffViewStore";
import {
	type DraftComment,
	NO_COMMENTS,
	useDraftCommentsStore,
} from "../stores/draftCommentsStore";
import { languageForPath } from "../utils/languageForPath";
import { CommentCardRow } from "./components/CommentCardRow";
import { ExpanderRow } from "./components/ExpanderRow";
import { FileHeaderRow } from "./components/FileHeaderRow";
import { HunkSegmentCell } from "./components/HunkSegmentCell";
import { ReviewOverlay } from "./components/ReviewOverlay";
import { useChangesetListItems } from "./hooks/useChangesetListItems";
import { useViewedFilesStore } from "./stores/viewedFilesStore";
import type { LineRow, ListItem } from "./utils/buildListItems";
import {
	attachDiffTokens,
	computeFileDiff,
	expandTabs,
	type FileDiffData,
} from "./utils/computeFileDiff";
import {
	CharWidthProbe,
	contentWidthForChars,
	ESTIMATED_CHAR_WIDTH,
	GUTTER_WIDTH,
	HUNK_ROW_HEIGHT,
} from "./utils/diffMetrics";

const MAX_HIGHLIGHT_BYTES = 200_000;
const NO_VIEWED_PATHS: string[] = [];
const FETCH_PIPELINE_START = 10;
const FETCH_PIPELINE_STEP = 6;
const FETCH_PIPELINE_LOOKAHEAD = 3;

export function FilesChangedScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const workspaceId = id ?? null;
	const { width: windowWidth } = useWindowDimensions();
	const queryClient = useQueryClient();

	const changeset = useWorkspaceChangeset(workspaceId);
	const { workspace } = useWorkspaceHost(workspaceId);
	const pullRequest = useWorkspacePullRequest(workspaceId);

	const [collapsedToggles, setCollapsedToggles] = useState<ReadonlySet<string>>(
		new Set(),
	);
	const [refreshing, setRefreshing] = useState(false);
	const [charWidth, setCharWidth] = useState(ESTIMATED_CHAR_WIDTH);
	const [enabledCount, setEnabledCount] = useState(FETCH_PIPELINE_START);
	const [priorityPaths, setPriorityPaths] = useState<ReadonlySet<string>>(
		new Set(),
	);

	const viewedPaths = useViewedFilesStore(
		(state) => state.viewedByWorkspace[workspaceId ?? ""] ?? NO_VIEWED_PATHS,
	);
	const toggleViewed = useViewedFilesStore((state) => state.toggleViewed);
	const viewedSet = useMemo(() => new Set(viewedPaths), [viewedPaths]);

	const comments = useDraftCommentsStore(
		(state) => state.commentsByWorkspace[workspaceId ?? ""] ?? NO_COMMENTS,
	);
	const removeComment = useDraftCommentsStore((state) => state.removeComment);
	const openComposer = useCommentComposerStore((state) => state.openComposer);

	const expansions = useDiffViewStore(
		(state) => state.expansionsByWorkspace[workspaceId ?? ""] ?? NO_EXPANSIONS,
	);
	const addExpansion = useDiffViewStore((state) => state.addExpansion);
	const jumpTarget = useDiffViewStore((state) => state.jumpTarget);
	const clearJump = useDiffViewStore((state) => state.clearJump);

	const listRef = useRef<FlashListRef<ListItem> | null>(null);

	const isExpanded = useCallback(
		(file: ChangesetFile) => {
			const restingCollapsed = viewedSet.has(file.path);
			const toggled = collapsedToggles.has(file.path);
			return restingCollapsed ? toggled : !toggled;
		},
		[viewedSet, collapsedToggles],
	);

	const toggleCollapsed = useCallback((path: string) => {
		setCollapsedToggles((previous) => {
			const next = new Set(previous);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	}, []);

	// The toggle bit is relative to the viewed baseline — reset it when the
	// baseline flips, or marking a collapsed file viewed would re-expand it.
	const onToggleViewed = useCallback(
		(path: string) => {
			if (!workspaceId) return;
			toggleViewed(workspaceId, path);
			setCollapsedToggles((previous) => {
				if (!previous.has(path)) return previous;
				const next = new Set(previous);
				next.delete(path);
				return next;
			});
		},
		[workspaceId, toggleViewed],
	);

	const fetchableFiles = useMemo(
		() => changeset.files.filter((file) => file.isBinary !== true),
		[changeset.files],
	);

	const diffQueries = useQueries({
		queries: fetchableFiles.map((file, index) => ({
			queryKey: [
				"workspace-file-diff-data",
				workspaceId,
				file.source,
				file.path,
				file.additions,
				file.deletions,
			] as const,
			enabled:
				changeset.hostUrl !== null &&
				(index < enabledCount || priorityPaths.has(file.path)),
			staleTime: Number.POSITIVE_INFINITY,
			retry: 1,
			networkMode: "always" as const,
			queryFn: async (): Promise<FileDiffData> => {
				const pair = await getHostServiceClientByUrl(
					changeset.hostUrl as string,
				).git.getDiff.query({
					workspaceId: workspaceId as string,
					path: file.path,
					category: file.source,
				});
				const oldContents = expandTabs(pair.oldFile.contents ?? "");
				const newContents = expandTabs(pair.newFile.contents ?? "");
				const data = computeFileDiff(file.path, oldContents, newContents);
				if (
					oldContents.length > MAX_HIGHLIGHT_BYTES ||
					newContents.length > MAX_HIGHLIGHT_BYTES
				) {
					return data;
				}
				const language = languageForPath(file.path);
				const [oldLines, newLines] = await Promise.all([
					tokenizeCode(oldContents, language),
					tokenizeCode(newContents, language),
				]);
				return attachDiffTokens(data, oldLines, newLines);
			},
		})),
	});

	const settledCount = diffQueries.reduce(
		(count, query, index) =>
			index < enabledCount && (query.isSuccess || query.isError)
				? count + 1
				: count,
		0,
	);
	useEffect(() => {
		if (enabledCount >= fetchableFiles.length) return;
		if (enabledCount - settledCount <= FETCH_PIPELINE_LOOKAHEAD) {
			setEnabledCount((current) =>
				Math.min(fetchableFiles.length, current + FETCH_PIPELINE_STEP),
			);
		}
	}, [settledCount, enabledCount, fetchableFiles.length]);

	const dataByPath = useMemo(() => {
		const map = new Map<
			string,
			{ data: FileDiffData | null; isError: boolean }
		>();
		fetchableFiles.forEach((file, index) => {
			const query = diffQueries[index];
			map.set(file.path, {
				data: query?.data ?? null,
				isError: query?.isError ?? false,
			});
		});
		return map;
	}, [fetchableFiles, diffQueries]);

	const { items, stickyHeaderIndices } = useChangesetListItems({
		files: changeset.files,
		dataByPath,
		expansions,
		comments,
		isExpanded,
		viewedSet,
	});

	// Horizontal pan: one shared value, per-segment clamping in HunkSegmentCell.
	const scrollX = useSharedValue(0);
	const maxScrollX = useSharedValue(0);
	const codeViewportWidth = windowWidth - GUTTER_WIDTH;

	const contentWidths = useMemo(() => {
		const byPath = new Map<string, number>();
		let maxOffset = 0;
		for (const [path, entry] of dataByPath) {
			if (!entry.data) continue;
			const width = contentWidthForChars(
				entry.data.maxLineChars + 2,
				charWidth,
			);
			byPath.set(path, width);
			maxOffset = Math.max(maxOffset, width - codeViewportWidth);
		}
		return { byPath, maxOffset: Math.max(0, maxOffset) };
	}, [dataByPath, charWidth, codeViewportWidth]);
	const contentWidthByPath = contentWidths.byPath;
	useEffect(() => {
		maxScrollX.value = contentWidths.maxOffset;
		if (scrollX.value > contentWidths.maxOffset) {
			scrollX.value = contentWidths.maxOffset;
		}
	}, [contentWidths.maxOffset, maxScrollX, scrollX]);

	const panStartX = useRef(0);
	const panResponder = useMemo(
		() =>
			PanResponder.create({
				onMoveShouldSetPanResponder: (_, gesture) =>
					Math.abs(gesture.dx) > 14 && Math.abs(gesture.dy) < 12,
				onPanResponderGrant: () => {
					panStartX.current = Math.min(scrollX.value, maxScrollX.value);
				},
				onPanResponderMove: (_, gesture) => {
					scrollX.value = Math.min(
						Math.max(panStartX.current - gesture.dx, 0),
						maxScrollX.value,
					);
				},
				onPanResponderRelease: (_, gesture) => {
					scrollX.value = withDecay({
						velocity: -gesture.vx * 1000,
						clamp: [0, maxScrollX.value],
					});
				},
				// Keep an in-flight horizontal drag: grant is horizontal-intent gated,
				// so the vertical list must not reclaim it mid-gesture.
				onPanResponderTerminationRequest: () => false,
			}),
		[scrollX, maxScrollX],
	);

	const openLineComposer = useCallback(
		(path: string, row: LineRow) => {
			if (!workspaceId) return;
			const side = row.type === "del" ? "old" : "new";
			openComposer({
				workspaceId,
				path,
				side,
				line: (side === "old" ? row.oldLineNumber : row.newLineNumber) ?? 0,
				lineText: row.text,
				lineType: row.type,
				tokens: row.tokens,
			});
			router.push(`/(authenticated)/workspace/${workspaceId}/line-comment`);
		},
		[workspaceId, openComposer, router],
	);

	const onCommentMenu = useCallback(
		(comment: DraftComment) => {
			ActionSheetIOS.showActionSheetWithOptions(
				{
					options: ["Edit", "Delete", "Cancel"],
					destructiveButtonIndex: 1,
					cancelButtonIndex: 2,
				},
				(buttonIndex) => {
					if (buttonIndex === 0 && workspaceId) {
						openComposer({
							workspaceId,
							path: comment.path,
							side: comment.side,
							line: comment.line,
							lineText: comment.lineText,
							lineType:
								comment.lineType ??
								(comment.line === 0
									? "file"
									: comment.side === "old"
										? "del"
										: "context"),
							tokens: comment.tokens,
							editingDraftId: comment.id,
							initialBody: comment.body,
						});
						router.push(
							`/(authenticated)/workspace/${workspaceId}/line-comment`,
						);
					} else if (buttonIndex === 1 && workspaceId) {
						removeComment(workspaceId, comment.id);
					}
				},
			);
		},
		[workspaceId, openComposer, removeComment, router],
	);

	const deleteFile = useCallback(
		(file: ChangesetFile) => {
			if (!workspace || !changeset.hostUrl) return;
			Alert.alert("Delete file", file.path, [
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: () => {
						getHostServiceClientByUrl(changeset.hostUrl as string)
							.filesystem.deletePath.mutate({
								workspaceId: workspace.id,
								absolutePath: `${workspace.worktreePath}/${file.path}`,
							})
							.then(() => changeset.refetch())
							.catch((cause: unknown) => {
								Alert.alert(
									"Could not delete file",
									cause instanceof Error ? cause.message : String(cause),
								);
							});
					},
				},
			]);
		},
		[workspace, changeset.hostUrl, changeset.refetch],
	);

	const copyFilePath = useCallback((file: ChangesetFile) => {
		void Clipboard.setStringAsync(file.path);
	}, []);

	const viewFile = useCallback(
		(file: ChangesetFile) => {
			router.push(
				`/(authenticated)/workspace/${workspaceId}/file?path=${encodeURIComponent(file.path)}&source=${file.source}`,
			);
		},
		[router, workspaceId],
	);

	const addFileComment = useCallback(
		(file: ChangesetFile) => {
			if (!workspaceId) return;
			openComposer({
				workspaceId,
				path: file.path,
				side: "new",
				line: 0,
				lineText: "",
				lineType: "file",
			});
			router.push(`/(authenticated)/workspace/${workspaceId}/line-comment`);
		},
		[workspaceId, openComposer, router],
	);

	useEffect(() => {
		if (!jumpTarget) return;
		const { path } = jumpTarget;
		setPriorityPaths((previous) => {
			if (previous.has(path)) return previous;
			const next = new Set(previous);
			next.add(path);
			return next;
		});
		// Force the target expanded whatever its resting state: viewed files
		// need the toggle bit set, manually-collapsed unviewed files need it
		// cleared.
		setCollapsedToggles((previous) => {
			const expandToggle = viewedSet.has(path);
			if (previous.has(path) === expandToggle) return previous;
			const next = new Set(previous);
			if (expandToggle) next.add(path);
			else next.delete(path);
			return next;
		});
		const index = items.findIndex(
			(item) => item.kind === "file" && item.file.path === path,
		);
		if (index >= 0) {
			listRef.current?.scrollToIndex({ index, animated: true });
		}
		clearJump();
	}, [jumpTarget, items, viewedSet, clearJump]);

	// The per-file diff queries key on +/− counts with infinite staleTime, so a
	// same-count content change needs an explicit invalidation to show up.
	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		try {
			await Promise.all([
				changeset.refetch(),
				queryClient.invalidateQueries({
					queryKey: ["workspace-file-diff-data", workspaceId],
				}),
			]);
		} finally {
			setRefreshing(false);
		}
	}, [changeset.refetch, queryClient, workspaceId]);

	const renderItem = useCallback(
		({ item }: { item: ListItem }) => {
			switch (item.kind) {
				case "file":
					return (
						<FileHeaderRow
							file={item.file}
							expanded={item.expanded}
							viewed={item.viewed}
							onToggle={toggleCollapsed}
							onCopyPath={copyFilePath}
							onViewFile={viewFile}
							onAddComment={addFileComment}
							onDelete={deleteFile}
							onToggleViewed={onToggleViewed}
						/>
					);
				case "hunk":
					return (
						<View
							className="bg-sky-500/10 justify-center px-3"
							style={{ height: HUNK_ROW_HEIGHT }}
						>
							<Text className="text-sky-300/80 font-mono text-[12px]">
								{item.header}
							</Text>
						</View>
					);
				case "segment":
					return (
						<HunkSegmentCell
							segment={item.segment}
							contentWidth={
								contentWidthByPath.get(item.path) ?? codeViewportWidth
							}
							codeViewportWidth={codeViewportWidth}
							scrollX={scrollX}
							onPressLine={openLineComposer}
						/>
					);
				case "expander":
					return (
						<ExpanderRow
							row={item.row}
							onExpand={(path, range) => {
								if (workspaceId) addExpansion(workspaceId, path, range);
							}}
						/>
					);
				case "truncated":
					return (
						<View className="items-center px-3 py-2">
							<Text className="text-muted-foreground text-xs">
								Diff truncated — {item.hiddenCount} more lines on the host
							</Text>
						</View>
					);
				case "comment":
					return (
						<CommentCardRow
							comment={item.comment}
							stale={item.stale}
							orphaned={item.orphaned}
							onLongPress={onCommentMenu}
						/>
					);
				case "note":
					return (
						<View
							className="items-center justify-center px-4 py-4"
							style={{ height: item.height }}
						>
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
			toggleCollapsed,
			copyFilePath,
			viewFile,
			addFileComment,
			deleteFile,
			onToggleViewed,
			workspaceId,
			contentWidthByPath,
			codeViewportWidth,
			scrollX,
			openLineComposer,
			addExpansion,
			onCommentMenu,
		],
	);

	const shareUrl =
		pullRequest?.url ??
		(workspaceId ? `https://app.superset.sh/workspaces/${workspaceId}` : null);

	return (
		<View className="bg-background flex-1">
			<Stack.Screen options={{ title: "Files changed" }}>
				<Stack.Title asChild>
					<View className="items-center">
						<Text className="font-semibold text-[16px]">Files changed</Text>
						<View className="flex-row gap-1.5">
							<Text className="text-green-500 font-semibold text-[11.5px]">
								+{changeset.additions.toLocaleString()}
							</Text>
							<Text className="text-red-500 font-semibold text-[11.5px]">
								−{changeset.deletions.toLocaleString()}
							</Text>
						</View>
					</View>
				</Stack.Title>
				<Stack.Toolbar placement="right">
					<Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="More actions">
						<Stack.Toolbar.MenuAction
							icon="square.and.arrow.up"
							onPress={() => {
								if (shareUrl) void Share.share({ url: shareUrl });
							}}
						>
							Share
						</Stack.Toolbar.MenuAction>
						{pullRequest ? (
							<Stack.Toolbar.MenuAction
								icon="arrow.up.right.square"
								onPress={() => void Linking.openURL(pullRequest.url)}
							>
								Open on GitHub
							</Stack.Toolbar.MenuAction>
						) : null}
					</Stack.Toolbar.Menu>
				</Stack.Toolbar>
			</Stack.Screen>
			<CharWidthProbe onMeasure={setCharWidth} />
			<View className="flex-1" {...panResponder.panHandlers}>
				<FlashList
					ref={listRef}
					data={items}
					renderItem={renderItem}
					keyExtractor={(item) => item.key}
					getItemType={(item) => item.kind}
					stickyHeaderIndices={stickyHeaderIndices}
					stickyHeaderConfig={{ hideRelatedCell: true }}
					contentContainerStyle={{ paddingBottom: 96 }}
					refreshControl={
						<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
					}
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
			</View>
			<ReviewOverlay
				draftCount={comments.length}
				onFinishReview={() =>
					router.push(`/(authenticated)/workspace/${workspaceId}/finish-review`)
				}
				onJumpToFile={() =>
					router.push(`/(authenticated)/workspace/${workspaceId}/jump-to-file`)
				}
			/>
		</View>
	);
}

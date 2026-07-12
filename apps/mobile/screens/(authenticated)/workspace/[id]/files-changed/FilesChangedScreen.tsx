import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
import { useQueries } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { FileDiff } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActionSheetIOS,
	ActivityIndicator,
	Alert,
	Linking,
	RefreshControl,
	Share,
	useWindowDimensions,
	View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	clamp,
	useSharedValue,
	withDecay,
} from "react-native-reanimated";
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
import { DiffLineRow } from "./components/DiffLineRow";
import { ExpanderRow } from "./components/ExpanderRow";
import { FileHeaderRow } from "./components/FileHeaderRow";
import { ReviewOverlay } from "./components/ReviewOverlay";
import { SummaryRow } from "./components/SummaryRow";
import { useViewedFilesStore } from "./stores/viewedFilesStore";
import { buildDisplayRows } from "./utils/buildDisplayRows";
import {
	attachDiffTokens,
	computeFileDiff,
	type DiffRow,
	expandTabs,
	type FileDiffData,
} from "./utils/computeFileDiff";
import {
	CharWidthProbe,
	contentWidthForChars,
	ESTIMATED_CHAR_WIDTH,
	GUTTER_WIDTH,
	SIGN_WIDTH,
} from "./utils/diffMetrics";

const MAX_HIGHLIGHT_BYTES = 200_000;
const NO_VIEWED_PATHS: string[] = [];
const LOADING_PLACEHOLDER_HEIGHT = 64;

type LineRow = Extract<DiffRow, { kind: "line" }>;

type ListItem =
	| { kind: "summary" }
	| { kind: "file"; file: ChangesetFile; expanded: boolean; viewed: boolean }
	| { kind: "diff-row"; path: string; row: DiffRow }
	| {
			kind: "comment";
			comment: DraftComment;
			stale: boolean;
			orphaned: boolean;
	  }
	| {
			kind: "note";
			path: string;
			key: string;
			note: "loading" | "error" | "binary";
	  };

function itemKey(item: ListItem): string {
	switch (item.kind) {
		case "summary":
			return "summary";
		case "file":
			return `file:${item.file.path}`;
		case "diff-row":
			return item.row.key;
		case "comment":
			return `comment:${item.comment.id}`;
		case "note":
			return item.key;
	}
}

export function FilesChangedScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const workspaceId = id ?? null;
	const { width: windowWidth } = useWindowDimensions();

	const changeset = useWorkspaceChangeset(workspaceId);
	const { workspace } = useWorkspaceHost(workspaceId);
	const pullRequest = useWorkspacePullRequest(workspaceId);

	const [collapsedToggles, setCollapsedToggles] = useState<ReadonlySet<string>>(
		new Set(),
	);
	const [refreshing, setRefreshing] = useState(false);
	const [charWidth, setCharWidth] = useState(ESTIMATED_CHAR_WIDTH);
	const [fetchEnabledPaths, setFetchEnabledPaths] = useState<
		ReadonlySet<string>
	>(new Set());

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

	const listRef = useRef<LegendListRef | null>(null);

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

	const fetchableFiles = useMemo(
		() => changeset.files.filter((file) => file.isBinary !== true),
		[changeset.files],
	);

	const diffQueries = useQueries({
		queries: fetchableFiles.map((file) => ({
			queryKey: [
				"workspace-file-diff-data",
				workspaceId,
				file.source,
				file.path,
				file.additions,
				file.deletions,
			] as const,
			enabled: changeset.hostUrl !== null && fetchEnabledPaths.has(file.path),
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

	const commentsByPath = useMemo(() => {
		const map = new Map<string, DraftComment[]>();
		for (const comment of comments) {
			const group = map.get(comment.path);
			if (group) group.push(comment);
			else map.set(comment.path, [comment]);
		}
		return map;
	}, [comments]);

	const items = useMemo<ListItem[]>(() => {
		const result: ListItem[] = [{ kind: "summary" }];
		const placedCommentIds = new Set<string>();
		for (const file of changeset.files) {
			const expanded = isExpanded(file);
			result.push({
				kind: "file",
				file,
				expanded,
				viewed: viewedSet.has(file.path),
			});
			const fileComments = commentsByPath.get(file.path) ?? [];
			if (!expanded) {
				for (const comment of fileComments) {
					placedCommentIds.add(comment.id);
					result.push({
						kind: "comment",
						comment,
						stale: false,
						orphaned: false,
					});
				}
				continue;
			}
			if (file.isBinary === true) {
				result.push({
					kind: "note",
					path: file.path,
					key: `${file.path}:binary`,
					note: "binary",
				});
				continue;
			}
			const entry = dataByPath.get(file.path);
			if (!entry?.data) {
				result.push({
					kind: "note",
					path: file.path,
					key: `${file.path}:${entry?.isError ? "error" : "loading"}`,
					note: entry?.isError ? "error" : "loading",
				});
				for (const comment of fileComments) {
					placedCommentIds.add(comment.id);
					result.push({
						kind: "comment",
						comment,
						stale: false,
						orphaned: false,
					});
				}
				continue;
			}
			const rows = buildDisplayRows(
				file.path,
				entry.data,
				expansions[file.path] ?? [],
			);
			for (const comment of fileComments) {
				if (comment.line === 0) {
					placedCommentIds.add(comment.id);
					result.push({
						kind: "comment",
						comment,
						stale: false,
						orphaned: false,
					});
				}
			}
			for (const row of rows) {
				result.push({ kind: "diff-row", path: file.path, row });
				if (row.kind !== "line") continue;
				for (const comment of fileComments) {
					if (placedCommentIds.has(comment.id) || comment.line === 0) continue;
					const lineNumber =
						comment.side === "old" ? row.oldLineNumber : row.newLineNumber;
					if (lineNumber === comment.line) {
						placedCommentIds.add(comment.id);
						result.push({
							kind: "comment",
							comment,
							stale: comment.lineText !== row.text,
							orphaned: false,
						});
					}
				}
			}
			for (const comment of fileComments) {
				if (placedCommentIds.has(comment.id)) continue;
				placedCommentIds.add(comment.id);
				result.push({ kind: "comment", comment, stale: true, orphaned: false });
			}
		}
		for (const comment of comments) {
			if (placedCommentIds.has(comment.id)) continue;
			result.push({ kind: "comment", comment, stale: true, orphaned: true });
		}
		return result;
	}, [
		changeset.files,
		isExpanded,
		viewedSet,
		dataByPath,
		commentsByPath,
		comments,
		expansions,
	]);

	const stickyHeaderIndices = useMemo(
		() =>
			items.reduce<number[]>((indices, item, index) => {
				if (item.kind === "file") indices.push(index);
				return indices;
			}, []),
		[items],
	);

	// Viewport-driven fetch gating: grow-only, with one-file lookahead so the
	// loading row rarely flashes into view.
	const onViewableItemsChanged = useCallback(
		({
			viewableItems,
		}: {
			viewableItems: Array<{ item: ListItem; isViewable: boolean }>;
		}) => {
			setFetchEnabledPaths((previous) => {
				let next: Set<string> | null = null;
				const enable = (path: string | null) => {
					if (!path || previous.has(path) || next?.has(path)) return;
					next ??= new Set(previous);
					next.add(path);
				};
				let lastFilePath: string | null = null;
				for (const viewable of viewableItems) {
					if (!viewable.isViewable) continue;
					const item = viewable.item;
					if (item.kind === "file") {
						enable(item.file.path);
						lastFilePath = item.file.path;
					} else if (item.kind === "diff-row" || item.kind === "note") {
						enable(item.path);
						lastFilePath = item.path;
					}
				}
				if (lastFilePath) {
					const index = fetchableFiles.findIndex(
						(file) => file.path === lastFilePath,
					);
					const lookahead = fetchableFiles[index + 1];
					if (lookahead) enable(lookahead.path);
				}
				return next ?? previous;
			});
		},
		[fetchableFiles],
	);

	// Horizontal pan: one shared value, per-row clamping in DiffLineRow.
	const scrollX = useSharedValue(0);
	const maxScrollX = useSharedValue(0);
	const codeViewportWidth = windowWidth - GUTTER_WIDTH - SIGN_WIDTH;

	const contentWidthByPath = useMemo(() => {
		const map = new Map<string, number>();
		let maxOffset = 0;
		for (const [path, entry] of dataByPath) {
			if (!entry.data) continue;
			const width = contentWidthForChars(entry.data.maxLineChars, charWidth);
			map.set(path, width);
			maxOffset = Math.max(maxOffset, width - codeViewportWidth);
		}
		maxScrollX.value = Math.max(0, maxOffset);
		return map;
	}, [dataByPath, charWidth, codeViewportWidth, maxScrollX]);

	const panGesture = useMemo(
		() =>
			Gesture.Pan()
				.activeOffsetX([-14, 14])
				.failOffsetY([-12, 12])
				.onStart(() => {
					scrollX.value = clamp(scrollX.value, 0, maxScrollX.value);
				})
				.onChange((event) => {
					scrollX.value = clamp(
						scrollX.value - event.changeX,
						0,
						maxScrollX.value,
					);
				})
				.onEnd((event) => {
					scrollX.value = withDecay({
						velocity: -event.velocityX,
						clamp: [0, maxScrollX.value],
					});
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
							lineType: comment.line === 0 ? "file" : "context",
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

	const openFileMenu = useCallback(
		(file: ChangesetFile) => {
			void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
			ActionSheetIOS.showActionSheetWithOptions(
				{
					title: file.path,
					options: [
						"Copy relative path",
						"View file",
						"Add file comment",
						"Delete file",
						"Cancel",
					],
					destructiveButtonIndex: 3,
					cancelButtonIndex: 4,
				},
				(buttonIndex) => {
					switch (buttonIndex) {
						case 0:
							void Clipboard.setStringAsync(file.path);
							return;
						case 1:
							router.push(
								`/(authenticated)/workspace/${workspaceId}/file?path=${encodeURIComponent(file.path)}&source=${file.source}`,
							);
							return;
						case 2:
							if (workspaceId) {
								openComposer({
									workspaceId,
									path: file.path,
									side: "new",
									line: 0,
									lineText: "",
									lineType: "file",
								});
								router.push(
									`/(authenticated)/workspace/${workspaceId}/line-comment`,
								);
							}
							return;
						case 3:
							deleteFile(file);
							return;
					}
				},
			);
		},
		[router, workspaceId, openComposer, deleteFile],
	);

	// Jump-to-file: force-expand, enable fetch, then land on the header (twice —
	// estimated heights above the target settle after the first pass).
	useEffect(() => {
		if (!jumpTarget) return;
		const { path } = jumpTarget;
		setFetchEnabledPaths((previous) => {
			if (previous.has(path)) return previous;
			const next = new Set(previous);
			next.add(path);
			return next;
		});
		if (viewedSet.has(path)) {
			setCollapsedToggles((previous) => {
				if (previous.has(path)) return previous;
				const next = new Set(previous);
				next.add(path);
				return next;
			});
		}
		const index = items.findIndex(
			(item) => item.kind === "file" && item.file.path === path,
		);
		if (index >= 0) {
			void listRef.current
				?.scrollToIndex({ index, animated: true })
				.then(() => listRef.current?.scrollToIndex({ index, animated: false }))
				.catch(() => {});
		}
		clearJump();
	}, [jumpTarget, items, viewedSet, clearJump]);

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
						<SummaryRow
							additions={changeset.additions}
							deletions={changeset.deletions}
							fileCount={changeset.files.length}
						/>
					);
				case "file":
					return (
						<FileHeaderRow
							file={item.file}
							expanded={item.expanded}
							viewed={item.viewed}
							onToggle={toggleCollapsed}
							onMenu={openFileMenu}
							onToggleViewed={(path) => {
								if (workspaceId) toggleViewed(workspaceId, path);
							}}
						/>
					);
				case "diff-row": {
					const row = item.row;
					if (row.kind === "hunk") {
						return (
							<View className="bg-sky-500/10 px-3 py-1.5">
								<Text className="text-sky-300/80 font-mono text-[12px]">
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
					if (row.kind === "expander") {
						return (
							<ExpanderRow
								row={row}
								onExpand={(path, range) => {
									if (workspaceId) addExpansion(workspaceId, path, range);
								}}
							/>
						);
					}
					return (
						<DiffLineRow
							row={row}
							contentWidth={
								contentWidthByPath.get(item.path) ?? codeViewportWidth
							}
							codeViewportWidth={codeViewportWidth}
							scrollX={scrollX}
							onPress={(lineRow) => openLineComposer(item.path, lineRow)}
						/>
					);
				}
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
							style={{ minHeight: LOADING_PLACEHOLDER_HEIGHT }}
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
			changeset.additions,
			changeset.deletions,
			changeset.files.length,
			toggleCollapsed,
			openFileMenu,
			toggleViewed,
			workspaceId,
			contentWidthByPath,
			codeViewportWidth,
			scrollX,
			openLineComposer,
			onCommentMenu,
			addExpansion,
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
			<GestureDetector gesture={panGesture}>
				<LegendList
					ref={listRef}
					className="flex-1"
					contentInsetAdjustmentBehavior="automatic"
					contentContainerStyle={{ paddingBottom: 96, paddingTop: 8 }}
					data={items}
					extraData={renderItem}
					keyExtractor={itemKey}
					renderItem={renderItem}
					stickyHeaderIndices={stickyHeaderIndices}
					renderScrollComponent={(props) => <Animated.ScrollView {...props} />}
					maintainVisibleContentPosition
					viewabilityConfig={{
						itemVisiblePercentThreshold: 10,
						minimumViewTime: 150,
					}}
					onViewableItemsChanged={onViewableItemsChanged}
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
			</GestureDetector>
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

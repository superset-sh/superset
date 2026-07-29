import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, MessageSquare } from "lucide-react-native";
import { FlatList, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import { FileStatusBadge } from "../components/FileStatusBadge";
import { useViewedFilesStore } from "../files-changed/stores/viewedFilesStore";
import {
	type ChangesetFile,
	useWorkspaceChangeset,
} from "../hooks/useWorkspaceChangeset";
import { useDiffViewStore } from "../stores/diffViewStore";
import {
	NO_COMMENTS,
	useDraftCommentsStore,
} from "../stores/draftCommentsStore";

// Stable fallback: an inline `?? []` makes the zustand snapshot a fresh array
// every read, which useSyncExternalStore treats as an endless store change.
const NO_VIEWED_PATHS: string[] = [];

function splitPath(path: string): { name: string; dir: string | null } {
	const separator = path.lastIndexOf("/");
	if (separator === -1) return { name: path, dir: null };
	return { name: path.slice(separator + 1), dir: path.slice(0, separator) };
}

export function JumpToFileSheet() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const workspaceId = id ?? "";

	const changeset = useWorkspaceChangeset(workspaceId || null);
	const requestJump = useDiffViewStore((state) => state.requestJump);
	const comments = useDraftCommentsStore(
		(state) => state.commentsByWorkspace[workspaceId] ?? NO_COMMENTS,
	);
	const viewedPaths = useViewedFilesStore(
		(state) => state.viewedByWorkspace[workspaceId] ?? NO_VIEWED_PATHS,
	);

	const commentCounts = new Map<string, number>();
	for (const comment of comments) {
		commentCounts.set(comment.path, (commentCounts.get(comment.path) ?? 0) + 1);
	}
	const viewedSet = new Set(viewedPaths);

	const jump = (file: ChangesetFile) => {
		requestJump(file.path);
		router.back();
	};

	return (
		<>
			<Stack.Screen options={{ title: "Jump to file" }} />
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					icon="xmark"
					accessibilityLabel="Close"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			<FlatList
				className="bg-background flex-1"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerClassName="pb-8 pt-1"
				data={changeset.files}
				keyExtractor={(file) => file.path}
				renderItem={({ item: file }) => {
					const { name, dir } = splitPath(file.path);
					const commentCount = commentCounts.get(file.path) ?? 0;
					return (
						<PressableScale
							className="border-border/50 flex-row items-center gap-3 border-b px-4 py-3"
							onPress={() => jump(file)}
						>
							<FileStatusBadge status={file.status} />
							<View className="min-w-0 flex-1">
								<Text className="font-semibold text-[14px]" numberOfLines={1}>
									{name}
								</Text>
								{dir ? (
									<Text
										className="text-muted-foreground text-[11.5px]"
										numberOfLines={1}
									>
										{dir}
									</Text>
								) : null}
							</View>
							{viewedSet.has(file.path) ? (
								<Icon as={CheckCircle2} className="text-green-500 size-4" />
							) : null}
							<View className="items-end gap-1">
								<View className="flex-row items-center gap-1">
									<Text className="text-green-500 font-medium text-[12px]">
										+{file.additions}
									</Text>
									<Text className="text-red-500 font-medium text-[12px]">
										−{file.deletions}
									</Text>
								</View>
								{commentCount > 0 ? (
									<View className="flex-row items-center gap-1">
										<Icon
											as={MessageSquare}
											className="text-muted-foreground size-3"
										/>
										<Text className="text-muted-foreground font-semibold text-[11px]">
											{commentCount}
										</Text>
									</View>
								) : null}
							</View>
						</PressableScale>
					);
				}}
				ListEmptyComponent={
					<View className="items-center py-16">
						<Text className="text-muted-foreground text-sm">
							No changed files.
						</Text>
					</View>
				}
			/>
		</>
	);
}

import { useQueries } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowRight, GitCommitHorizontal } from "lucide-react-native";
import { useMemo } from "react";
import { FlatList, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { compactTime } from "@/screens/(authenticated)/(home)/home/components/SessionRow/utils/compactTime";
import { useWorkspaceChangeset } from "../hooks/useWorkspaceChangeset";
import { useWorkspaceCommits } from "../hooks/useWorkspaceCommits";
import { AuthorAvatar } from "./components/AuthorAvatar";
import { TimelineRow } from "./components/TimelineRow";

const MAX_STAT_QUERIES = 30;

export function CommitsSheet() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const workspaceId = id ?? null;

	const { commits, hostUrl } = useWorkspaceCommits(workspaceId);
	const { baseBranch } = useWorkspaceChangeset(workspaceId);

	const statTargets = useMemo(
		() => (hostUrl ? commits.slice(0, MAX_STAT_QUERIES) : []),
		[commits, hostUrl],
	);
	const statQueries = useQueries({
		queries: statTargets.map((commit) => ({
			queryKey: ["workspace-commit-files", workspaceId, commit.hash] as const,
			staleTime: Number.POSITIVE_INFINITY,
			retry: 1,
			networkMode: "always" as const,
			queryFn: async () => {
				const { files } = await getHostServiceClientByUrl(
					hostUrl as string,
				).git.getCommitFiles.query({
					workspaceId: workspaceId as string,
					commitHash: commit.hash,
				});
				let additions = 0;
				let deletions = 0;
				for (const file of files) {
					additions += file.additions;
					deletions += file.deletions;
				}
				return { additions, deletions };
			},
		})),
	});
	const statsByHash = useMemo(() => {
		const map = new Map<string, { additions: number; deletions: number }>();
		statTargets.forEach((commit, index) => {
			const data = statQueries[index]?.data;
			if (data) map.set(commit.hash, data);
		});
		return map;
	}, [statTargets, statQueries]);

	return (
		// Header items are native bar items (pinned, content scrolls under the
		// transparent sheet header); the composition elements render null, so the
		// FlatList stays the sheet's only layout child (formSheet cold-mount bug).
		<>
			<Stack.Title asChild>
				<View className="items-center">
					<Text className="font-semibold text-[17px]">Commits</Text>
					<View className="flex-row items-center gap-1.5">
						<Icon
							as={GitCommitHorizontal}
							className="text-muted-foreground size-3.5"
						/>
						<Text className="text-muted-foreground text-xs">
							{commits.length === 1 ? "1 Commit" : `${commits.length} Commits`}
						</Text>
						{baseBranch ? (
							<>
								<Icon
									as={ArrowRight}
									className="text-muted-foreground size-3"
								/>
								<Text className="text-muted-foreground text-xs">
									{baseBranch}
								</Text>
							</>
						) : null}
					</View>
				</View>
			</Stack.Title>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					icon="xmark"
					accessibilityLabel="Close"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			<FlatList
				className="bg-background flex-1"
				data={commits}
				keyExtractor={(commit) => commit.hash}
				contentInsetAdjustmentBehavior="automatic"
				contentContainerClassName="px-4 pb-8 pt-1"
				renderItem={({ item: commit, index }) => {
					const stats = statsByHash.get(commit.hash);
					return (
						<TimelineRow
							first={index === 0}
							last={index === commits.length - 1}
						>
							<View className="flex-1">
								<Text className="text-[15px]" numberOfLines={3}>
									{commit.message}
								</Text>
								<View className="mt-1 flex-row items-center gap-1.5">
									<AuthorAvatar
										name={commit.author}
										email={commit.authorEmail}
									/>
									<Text className="text-muted-foreground text-[13px]">
										{commit.author}
									</Text>
									{stats ? (
										<>
											<Text className="text-muted-foreground text-[13px]">
												·
											</Text>
											<Text className="text-green-500 font-medium text-[13px]">
												+{stats.additions}
											</Text>
											<Text className="text-red-500 font-medium text-[13px]">
												−{stats.deletions}
											</Text>
										</>
									) : null}
								</View>
							</View>
							<Text className="text-muted-foreground pt-0.5 text-[13px]">
								{compactTime(new Date(commit.date).getTime())}
							</Text>
						</TimelineRow>
					);
				}}
				ListEmptyComponent={
					<View className="items-center py-16">
						<Text className="text-muted-foreground text-sm">
							No commits on this branch yet.
						</Text>
					</View>
				}
			/>
		</>
	);
}

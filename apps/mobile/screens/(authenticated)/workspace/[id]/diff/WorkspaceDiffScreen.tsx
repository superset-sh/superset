import { formatDistanceToNowStrict } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
	CheckCircle2,
	ChevronRight,
	Circle,
	CircleDot,
	FileDiff,
	GitCommitHorizontal,
	XCircle,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import { useWorkspaceChangeset } from "../hooks/useWorkspaceChangeset";
import { useWorkspaceCommits } from "../hooks/useWorkspaceCommits";
import { useWorkspacePullRequest } from "../hooks/useWorkspacePullRequest";

function SectionLabel({ children }: { children: string }) {
	return (
		<Text className="text-muted-foreground px-4 pb-2 pt-6 font-semibold text-xs uppercase tracking-wider">
			{children}
		</Text>
	);
}

function CardRow({
	icon,
	iconClassName,
	label,
	trailing,
	first,
	onPress,
}: {
	icon: typeof FileDiff;
	iconClassName?: string;
	label: string;
	trailing?: React.ReactNode;
	first?: boolean;
	onPress?: () => void;
}) {
	return (
		<PressableScale
			className={cn(
				"flex-row items-center gap-3 px-4 py-3.5",
				!first && "border-border/60 border-t",
			)}
			disabled={!onPress}
			onPress={onPress ?? (() => {})}
		>
			<Icon
				as={icon}
				className={cn("size-5 text-muted-foreground", iconClassName)}
				strokeWidth={1.75}
			/>
			<Text className="flex-1 text-[15px]">{label}</Text>
			{trailing}
			{onPress ? (
				<Icon as={ChevronRight} className="text-muted-foreground/60 size-4" />
			) : null}
		</PressableScale>
	);
}

const CHECK_ICON = {
	success: { icon: CheckCircle2, className: "text-green-500" },
	failure: { icon: XCircle, className: "text-red-500" },
	pending: { icon: CircleDot, className: "text-amber-500" },
	none: { icon: Circle, className: "text-muted-foreground/50" },
} as const;

const REVIEW_LABEL: Record<string, string> = {
	APPROVED: "Approved",
	CHANGES_REQUESTED: "Changes requested",
	REVIEW_REQUIRED: "Review required",
};

export function WorkspaceDiffScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const workspaceId = id ?? null;

	const changeset = useWorkspaceChangeset(workspaceId);
	const { commits } = useWorkspaceCommits(workspaceId);
	const pullRequest = useWorkspacePullRequest(workspaceId);

	const [refreshing, setRefreshing] = useState(false);
	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		try {
			await changeset.refetch();
		} finally {
			setRefreshing(false);
		}
	}, [changeset.refetch]);

	const fileCount = changeset.files.length;
	const latestCommit = commits[0] ?? null;
	const checksStatus = (pullRequest?.checksStatus ??
		"none") as keyof typeof CHECK_ICON;
	const checks = pullRequest?.checks ?? [];
	const reviewDecision = pullRequest?.reviewDecision ?? null;

	return (
		<ScrollView
			className="bg-background flex-1"
			contentInsetAdjustmentBehavior="automatic"
			contentContainerStyle={{ paddingBottom: 32 }}
			refreshControl={
				<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
			}
		>
			<SectionLabel>Changes</SectionLabel>
			<View className="bg-card border-border mx-4 rounded-xl border">
				<CardRow
					first
					icon={FileDiff}
					label={
						fileCount === 1 ? "1 file changed" : `${fileCount} files changed`
					}
					trailing={
						<View className="flex-row items-center gap-1.5">
							<Text className="text-green-500 font-semibold text-[13px]">
								+{changeset.additions}
							</Text>
							<Text className="text-red-500 font-semibold text-[13px]">
								−{changeset.deletions}
							</Text>
						</View>
					}
					onPress={
						fileCount > 0
							? () =>
									router.push(
										`/(authenticated)/workspace/${workspaceId}/files-changed`,
									)
							: undefined
					}
				/>
				<CardRow
					icon={GitCommitHorizontal}
					label={
						commits.length === 1 ? "1 commit" : `${commits.length} commits`
					}
					trailing={
						latestCommit ? (
							<Text className="text-muted-foreground text-[13px]">
								{formatDistanceToNowStrict(new Date(latestCommit.date), {
									addSuffix: true,
								})}
							</Text>
						) : undefined
					}
					onPress={
						commits.length > 0
							? () =>
									router.push(
										`/(authenticated)/workspace/${workspaceId}/commits`,
									)
							: undefined
					}
				/>
			</View>

			<SectionLabel>Status</SectionLabel>
			{pullRequest ? (
				<View className="bg-card border-border mx-4 rounded-xl border">
					<CardRow
						first
						icon={CHECK_ICON[checksStatus].icon}
						iconClassName={CHECK_ICON[checksStatus].className}
						label="Checks"
					/>
					{checks.map((check) => {
						const conclusion =
							check.conclusion === "success"
								? CHECK_ICON.success
								: check.conclusion == null
									? CHECK_ICON.pending
									: CHECK_ICON.failure;
						return (
							<View
								className="border-border/60 flex-row items-center gap-3 border-t py-2.5 pl-12 pr-4"
								key={check.name}
							>
								<Icon
									as={conclusion.icon}
									className={cn("size-4", conclusion.className)}
									strokeWidth={1.75}
								/>
								<Text
									className="text-muted-foreground flex-1 text-[13px]"
									numberOfLines={1}
								>
									{check.name}
								</Text>
							</View>
						);
					})}
					<CardRow
						icon={
							reviewDecision === "APPROVED"
								? CheckCircle2
								: reviewDecision === "CHANGES_REQUESTED"
									? XCircle
									: Circle
						}
						iconClassName={
							reviewDecision === "APPROVED"
								? "text-green-500"
								: reviewDecision === "CHANGES_REQUESTED"
									? "text-red-500"
									: "text-muted-foreground/50"
						}
						label="Reviews"
						trailing={
							reviewDecision ? (
								<Text className="text-muted-foreground text-[13px]">
									{REVIEW_LABEL[reviewDecision] ?? reviewDecision}
								</Text>
							) : undefined
						}
					/>
				</View>
			) : (
				<View className="bg-card border-border mx-4 rounded-xl border px-4 py-4">
					<Text className="font-semibold text-[15px]">PR not opened yet</Text>
					<Text className="text-muted-foreground mt-1 text-sm">
						Open a PR from this branch to see CI checks, reviews, and
						deployments.
					</Text>
				</View>
			)}

			{changeset.isReady && fileCount === 0 ? (
				<View className="items-center gap-2 px-10 py-16">
					<Icon
						as={FileDiff}
						className="text-muted-foreground/50 size-10"
						strokeWidth={1.4}
					/>
					<Text className="text-muted-foreground text-center text-sm">
						No changes on this branch yet.
					</Text>
				</View>
			) : null}
		</ScrollView>
	);
}

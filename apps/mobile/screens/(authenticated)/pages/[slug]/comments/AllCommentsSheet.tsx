import { Plural, useLingui } from "@lingui/react/macro";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { usePageQuery } from "../../hooks/usePages";
import { CommentRow } from "../components/CommentRow";
import { usePageCommentsQuery } from "../hooks/usePageComments";
import { usePageCommentStore } from "../stores/pageCommentStore";

const VISIBLE_WITHOUT_FOLDING = 3;

/**
 * Desktop's CommentsPanel as a sheet: one bordered card per thread, the
 * anchor quoted above the comments, long threads folded to head and tail.
 */
export function AllCommentsSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const { slug } = useLocalSearchParams<{ slug: string }>();
	const setThreadId = usePageCommentStore((state) => state.setThreadId);

	const page = usePageQuery(slug);
	const comments = usePageCommentsQuery(page.data?.id);
	const threads = comments.data ?? [];
	// A cold mount has no threads yet either — "no comments" is only true once
	// both queries have answered.
	const loading = page.isLoading || comments.isLoading;

	return (
		<>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					accessibilityLabel={t({ message: "Close" })}
					icon="xmark"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>

			<ScrollView
				className="bg-background flex-1"
				contentContainerClassName="pb-10 pt-2"
				contentInsetAdjustmentBehavior="automatic"
			>
				{loading ? (
					<View className="items-center justify-center py-20">
						<Spinner className="size-5" />
					</View>
				) : null}

				{!loading && threads.length === 0 ? (
					<View className="items-center justify-center px-8 py-20">
						<Text className="text-muted-foreground text-center">
							{t({ message: "No comments on this page yet" })}
						</Text>
					</View>
				) : null}

				{threads.map((thread) => {
					const folded = thread.comments.length > VISIBLE_WITHOUT_FOLDING;
					const head = folded ? thread.comments.slice(0, 1) : thread.comments;
					const tail = folded ? thread.comments.slice(-2) : [];
					const hidden = thread.comments.length - head.length - tail.length;

					return (
						<Pressable
							key={thread.id}
							accessibilityRole="button"
							onPress={() => {
								setThreadId(thread.id);
								router.replace({
									pathname: "/(authenticated)/pages/[slug]/thread",
									params: { slug },
								});
							}}
							className={cn(
								"border-border mx-3 mb-2 overflow-hidden rounded-xl border py-1.5 active:opacity-60",
								thread.resolved && "opacity-60",
							)}
						>
							{thread.anchorText ? (
								<View className="px-3 pt-1.5 pb-1">
									<View className="border-border border-l-2 pl-2">
										<Text
											className="text-muted-foreground text-xs"
											numberOfLines={2}
										>
											{thread.anchorText}
										</Text>
									</View>
								</View>
							) : null}

							{head.map((comment) => (
								<CommentRow key={comment.id} comment={comment} />
							))}

							{hidden > 0 ? (
								<Text className="text-muted-foreground px-3 py-1 text-xs">
									<Plural
										value={hidden}
										one="# more reply"
										other="# more replies"
									/>
								</Text>
							) : null}

							{tail.map((comment) => (
								<CommentRow key={comment.id} comment={comment} />
							))}

							{thread.resolved ? (
								<Text className="text-muted-foreground px-3 pt-1 pb-1.5 text-[11px]">
									{t({ message: "Resolved" })}
								</Text>
							) : null}
						</Pressable>
					);
				})}
			</ScrollView>
		</>
	);
}

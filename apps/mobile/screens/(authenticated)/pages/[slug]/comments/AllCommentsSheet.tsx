import { Plural, useLingui } from "@lingui/react/macro";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { usePageQuery } from "../../hooks/usePages";
import { CommentRow } from "../components/CommentRow";
import { usePageCommentsQuery } from "../hooks/usePageComments";
import { usePageCommentStore } from "../stores/pageCommentStore";

const VISIBLE_REPLIES = 2;

export function AllCommentsSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const { slug } = useLocalSearchParams<{ slug: string }>();
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});
	const setThreadId = usePageCommentStore((state) => state.setThreadId);

	const page = usePageQuery(slug);
	const comments = usePageCommentsQuery(page.data?.id);
	const threads = comments.data ?? [];

	const openThread = (threadId: string) => {
		setThreadId(threadId);
		router.replace({
			pathname: "/(authenticated)/pages/[slug]/thread",
			params: { slug },
		});
	};

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
				contentContainerClassName="px-4 pb-10 pt-1"
				contentInsetAdjustmentBehavior="automatic"
			>
				{threads.length === 0 ? (
					<View className="items-center justify-center px-8 py-24">
						<Text className="text-muted-foreground text-center">
							{t({ message: "No comments on this page yet" })}
						</Text>
						<Text className="text-muted-foreground/70 mt-1 text-center text-sm">
							{t({ message: "Tap the focus button to comment on a block." })}
						</Text>
					</View>
				) : null}

				{threads.map((thread) => {
					const [root, ...replies] = thread.comments;
					if (!root) return null;
					const isExpanded = expanded[thread.id] ?? false;
					const shown = isExpanded
						? replies
						: replies.slice(0, VISIBLE_REPLIES);
					const hidden = replies.length - shown.length;

					return (
						<Pressable
							key={thread.id}
							accessibilityRole="button"
							onPress={() => openThread(thread.id)}
							className={cn(
								"active:opacity-60",
								thread.resolved && "opacity-50",
							)}
						>
							<CommentRow
								comment={root}
								onReply={() => openThread(thread.id)}
							/>

							{shown.map((reply) => (
								<CommentRow key={reply.id} comment={reply} indented />
							))}

							{hidden > 0 ? (
								<Pressable
									accessibilityRole="button"
									onPress={() =>
										setExpanded((previous) => ({
											...previous,
											[thread.id]: true,
										}))
									}
									hitSlop={8}
									className="self-start py-1 pl-11 active:opacity-60"
								>
									<Text className="text-muted-foreground text-xs font-medium">
										<Plural
											value={hidden}
											one="View # more reply"
											other="View # more replies"
										/>
									</Text>
								</Pressable>
							) : null}
						</Pressable>
					);
				})}
			</ScrollView>
		</>
	);
}

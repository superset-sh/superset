import { useLingui } from "@lingui/react/macro";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { errorCopy } from "@/lib/errors";
import { usePageQuery } from "../../hooks/usePages";
import { CommentComposer } from "../components/CommentComposer";
import { CommentRow } from "../components/CommentRow";
import {
	usePageCommentActions,
	usePageCommentsQuery,
} from "../hooks/usePageComments";
import { usePageCommentStore } from "../stores/pageCommentStore";

export function CommentThreadSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const { slug } = useLocalSearchParams<{ slug: string }>();
	const scrollRef = useRef<ScrollView>(null);
	const settled = useRef(false);
	const [resolving, setResolving] = useState(false);
	const threadId = usePageCommentStore((state) => state.threadId);

	const page = usePageQuery(slug);
	const comments = usePageCommentsQuery(page.data?.id);
	const { reply, setResolved } = usePageCommentActions(page.data?.id);

	const thread = useMemo(
		() => (comments.data ?? []).find((row) => row.id === threadId),
		[comments.data, threadId],
	);

	return (
		<>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					accessibilityLabel={t({ message: "Close" })}
					icon="xmark"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			{thread ? (
				<Stack.Toolbar placement="right">
					<Stack.Toolbar.Button
						accessibilityLabel={
							thread.resolved
								? t({ message: "Reopen" })
								: t({ message: "Resolve" })
						}
						icon={thread.resolved ? "arrow.uturn.backward" : "checkmark"}
						onPress={async () => {
							if (resolving) return;
							setResolving(true);
							try {
								await setResolved.mutateAsync({
									threadId: thread.id,
									resolved: !thread.resolved,
								});
							} catch (error) {
								Alert.alert(
									thread.resolved
										? t({ message: "Could not reopen this comment" })
										: t({ message: "Could not resolve this comment" }),
									errorCopy(error),
								);
							}
							setResolving(false);
						}}
					/>
				</Stack.Toolbar>
			) : null}

			<ScrollView
				ref={scrollRef}
				className="bg-background flex-1"
				contentInsetAdjustmentBehavior="automatic"
				keyboardShouldPersistTaps="handled"
				contentContainerClassName="px-4 pb-10 pt-1"
				onContentSizeChange={() => {
					if (settled.current || !thread) return;
					settled.current = true;
					scrollRef.current?.scrollToEnd({ animated: false });
				}}
			>
				{thread ? (
					<>
						{thread.comments.map((comment, index) => (
							<CommentRow
								key={comment.id}
								comment={comment}
								indented={index > 0}
							/>
						))}

						<View className="pt-3">
							<CommentComposer
								placeholder={t({ message: "Reply" })}
								pending={reply.isPending}
								onSubmit={async (body) => {
									await reply.mutateAsync({ threadId: thread.id, body });
								}}
							/>
						</View>
					</>
				) : (
					<View className="items-center justify-center py-24">
						<Text className="text-muted-foreground">
							{t({ message: "This comment is no longer here" })}
						</Text>
					</View>
				)}
			</ScrollView>
		</>
	);
}

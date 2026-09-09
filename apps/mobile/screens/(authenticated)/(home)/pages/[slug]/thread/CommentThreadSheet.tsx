import { useLingui } from "@lingui/react/macro";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { Text } from "@/components/ui/text";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import { usePageQuery } from "../../hooks/usePages";
import { CommentRow } from "../components/CommentRow";
import {
	usePageCommentActions,
	usePageCommentsQuery,
} from "../hooks/usePageComments";
import { usePageCommentStore } from "../stores/pageCommentStore";

/**
 * The scroll view must stay the sheet's only layout child (formSheet
 * cold-mount flex bug); title/toolbar render null into the native bar.
 */
export function CommentThreadSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const { slug } = useLocalSearchParams<{ slug: string }>();
	const [body, setBody] = useState("");
	const scrollRef = useRef<ScrollView>(null);
	// A long thread would otherwise open at its oldest comment, with the reply
	// box off-screen — the newest message and the composer are what you came for.
	const settled = useRef(false);
	const threadId = usePageCommentStore((state) => state.threadId);

	const page = usePageQuery(slug);
	const comments = usePageCommentsQuery(page.data?.id);
	const { reply, setResolved } = usePageCommentActions(page.data?.id);

	const thread = useMemo(
		() => (comments.data ?? []).find((row) => row.id === threadId),
		[comments.data, threadId],
	);
	const trimmed = body.trim();

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
						onPress={() =>
							void setResolved.mutateAsync({
								threadId: thread.id,
								resolved: !thread.resolved,
							})
						}
					/>
				</Stack.Toolbar>
			) : null}

			<ScrollView
				ref={scrollRef}
				className="bg-background flex-1"
				contentInsetAdjustmentBehavior="automatic"
				keyboardShouldPersistTaps="handled"
				contentContainerClassName="pb-10 pt-2"
				onContentSizeChange={() => {
					if (settled.current || !thread) return;
					settled.current = true;
					scrollRef.current?.scrollToEnd({ animated: false });
				}}
			>
				{thread ? (
					<>
						{thread.anchorText ? (
							<View className="border-border mx-3 mb-3 border-l-2 pl-2">
								<Text
									className="text-muted-foreground text-[13px]"
									numberOfLines={4}
								>
									{thread.anchorText}
								</Text>
							</View>
						) : null}

						{thread.comments.map((comment) => (
							<CommentRow key={comment.id} comment={comment} />
						))}

						<TextInput
							className="border-border text-foreground mx-3 mt-3 min-h-20 rounded-xl border px-3.5 py-3 text-[15px]"
							multiline
							onChangeText={setBody}
							placeholder={t({ message: "Reply" })}
							placeholderTextColor="#6b7280"
							value={body}
						/>

						<PressableScale
							className={
								trimmed.length > 0
									? "bg-primary mx-3 mt-3 items-center rounded-xl py-3"
									: "bg-primary/40 mx-3 mt-3 items-center rounded-xl py-3"
							}
							disabled={trimmed.length === 0 || reply.isPending}
							onPress={async () => {
								if (trimmed.length === 0) return;
								await reply.mutateAsync({
									threadId: thread.id,
									body: trimmed,
								});
								setBody("");
							}}
						>
							<Text className="text-primary-foreground font-semibold text-[15px]">
								{t({ message: "Reply" })}
							</Text>
						</PressableScale>
					</>
				) : (
					<View className="items-center justify-center py-20">
						<Text className="text-muted-foreground">
							{t({ message: "This comment is no longer here" })}
						</Text>
					</View>
				)}
			</ScrollView>
		</>
	);
}

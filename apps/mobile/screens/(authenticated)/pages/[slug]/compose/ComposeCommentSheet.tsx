import { useLingui } from "@lingui/react/macro";
import { Stack, useRouter } from "expo-router";
import { ScrollView } from "react-native";
import { CommentComposer } from "../components/CommentComposer";
import { usePageCommentActions } from "../hooks/usePageComments";
import { usePageCommentStore } from "../stores/pageCommentStore";

export function ComposeCommentSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const pageId = usePageCommentStore((state) => state.pageId);
	const version = usePageCommentStore((state) => state.version);
	const anchor = usePageCommentStore((state) => state.anchor);
	const clear = usePageCommentStore((state) => state.clear);
	const { createThread } = usePageCommentActions(pageId ?? undefined);

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
				contentInsetAdjustmentBehavior="automatic"
				keyboardShouldPersistTaps="handled"
				contentContainerClassName="px-4 pb-10 pt-2"
			>
				<CommentComposer
					autoFocus
					placeholder={t({ message: "Write a comment" })}
					pending={createThread.isPending}
					onSubmit={async (body) => {
						if (version == null || anchor == null) {
							throw new Error("This page is no longer open for comments");
						}
						await createThread.mutateAsync({ version, anchor, body });
						clear();
						router.back();
					}}
				/>
			</ScrollView>
		</>
	);
}

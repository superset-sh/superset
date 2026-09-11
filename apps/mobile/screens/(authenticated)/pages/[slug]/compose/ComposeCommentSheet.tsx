import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import { usePageComments } from "@superset/cloud-client";
import { i18n } from "@superset/i18n";
import type { CommentIntent } from "@superset/shared/page-comments";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, ScrollView, View } from "react-native";
import { errorCopy } from "@/lib/errors";
import { CommentComposer } from "../components/CommentComposer";
import { ComposerActions } from "../components/ComposerActions";
import { usePageCommentUser } from "../hooks/usePageCommentUser";
import { usePageCommentStore } from "../stores/pageCommentStore";

export function ComposeCommentSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const { slug } = useLocalSearchParams<{ slug: string }>();
	const pageId = usePageCommentStore((state) => state.pageId);
	const version = usePageCommentStore((state) => state.version);
	const anchor = usePageCommentStore((state) => state.anchor);
	const clear = usePageCommentStore((state) => state.clear);
	const user = usePageCommentUser();
	const store = usePageComments({
		pageId: pageId ?? "",
		version: version ?? 0,
		user,
	});

	const postQuick = async (body: MessageDescriptor, intent: CommentIntent) => {
		if (version == null || anchor == null || store.submitting) return;
		try {
			await store.createThread({
				anchor,
				anchorText: anchor.text,
				body: i18n._(body),
				intent,
			});
		} catch (error) {
			Alert.alert(t({ message: "Comment not posted" }), errorCopy(error));
			return;
		}
		clear();
		router.back();
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
				contentInsetAdjustmentBehavior="automatic"
				keyboardShouldPersistTaps="handled"
				contentContainerClassName="px-4 pb-10 pt-2"
			>
				<View className="border-border border-b pb-2">
					<ComposerActions
						disabled={store.submitting}
						onQuick={(body, intent) => void postQuick(body, intent)}
						onOpenPresets={() =>
							router.replace({
								pathname: "/(authenticated)/pages/[slug]/quick",
								params: { slug },
							})
						}
					/>
				</View>

				<View className="pt-2">
					<CommentComposer
						autoFocus
						placeholder={t({ message: "Write a comment" })}
						pending={store.submitting}
						onSubmit={async (body) => {
							if (version == null || anchor == null) {
								throw new Error("This page is no longer open for comments");
							}
							await store.createThread({
								anchor,
								anchorText: anchor.text,
								body,
							});
							clear();
							router.back();
						}}
					/>
				</View>
			</ScrollView>
		</>
	);
}

import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import { usePageComments } from "@superset/cloud-client";
import { i18n } from "@superset/i18n";
import type { CommentIntent } from "@superset/shared/page-comments";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { Text } from "@/components/ui/text";
import { errorCopy } from "@/lib/errors";
import { CommentComposer } from "../components/CommentComposer";
import { QuickReplies } from "../components/QuickReplies";
import { usePageCommentUser } from "../hooks/usePageCommentUser";
import { usePageCommentStore } from "../stores/pageCommentStore";

export function CommentSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const navigation = useNavigation();
	// Pinned at mount: the parent screen clears the pick when it regains focus,
	// which would otherwise empty this sheet while the user is still in it.
	const [pick] = useState(() => {
		const state = usePageCommentStore.getState();
		return {
			pageId: state.pageId,
			version: state.version,
			anchor: state.anchor,
		};
	});
	const user = usePageCommentUser();
	const store = usePageComments({
		pageId: pick.pageId ?? "",
		version: pick.version ?? 0,
		user,
	});
	const inFlight = useRef(false);

	useEffect(() => {
		if (!pick.anchor) router.back();
	}, [pick.anchor, router]);

	const post = async (text: string, intent?: CommentIntent) => {
		const { anchor, version } = pick;
		// Resolving here would read as success to the composer, which clears the
		// draft on it — nothing was sent, so this has to reject.
		if (!anchor || version === null || inFlight.current) {
			throw new Error(t({ message: "Try again" }));
		}
		inFlight.current = true;
		try {
			await store.createThread({
				anchor,
				anchorText: anchor.text,
				body: text,
				...(intent ? { intent } : {}),
			});
		} finally {
			inFlight.current = false;
		}
		if (navigation.isFocused()) router.back();
	};

	const postQuick = async (text: string, intent?: CommentIntent) => {
		if (inFlight.current) return;
		try {
			await post(text, intent);
		} catch (error) {
			Alert.alert(t({ message: "Comment not posted" }), errorCopy(error));
		}
	};

	return (
		<View className="gap-2 px-4 pt-4">
			{pick.anchor?.text ? (
				<View className="border-muted-foreground/30 flex-row border-l-2 pl-2.5">
					<Text
						className="text-muted-foreground text-[13px] leading-[17px]"
						numberOfLines={1}
					>
						{pick.anchor.text}
					</Text>
				</View>
			) : null}

			<CommentComposer
				autoFocus
				placeholder={t({ message: "Write a comment" })}
				pending={store.submitting}
				onSubmit={(body) => post(body)}
				actions={({ hasDraft }) => (
					<QuickReplies
						disabled={store.submitting || hasDraft}
						onQuick={(quick: MessageDescriptor, intent: CommentIntent) => {
							void postQuick(i18n._(quick), intent);
						}}
						onPreset={(preset) => void postQuick(preset)}
					/>
				)}
			/>
		</View>
	);
}

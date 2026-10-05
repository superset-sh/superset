import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import { usePageComments } from "@superset/cloud-client";
import { i18n } from "@superset/i18n";
import type { CommentIntent } from "@superset/shared/page-comments";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import Animated, {
	useAnimatedKeyboard,
	useAnimatedStyle,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorCopy } from "@/lib/errors";
import { CommentComposer } from "../components/CommentComposer";
import { ComposerCard } from "../components/ComposerCard";
import { QuickReplies } from "../components/QuickReplies";
import { usePageCommentUser } from "../hooks/usePageCommentUser";
import { usePageCommentStore } from "../stores/pageCommentStore";

export function CommentSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const navigation = useNavigation();
	const [pick] = useState(() => {
		const state = usePageCommentStore.getState();
		return {
			pageId: state.pageId,
			version: state.version,
			anchor: state.anchor,
		};
	});
	const user = usePageCommentUser();
	const insets = useSafeAreaInsets();
	const keyboard = useAnimatedKeyboard();
	const lift = useAnimatedStyle(() => ({
		paddingBottom: Math.max(keyboard.height.value, insets.bottom) + 8,
	}));
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
		<View className="flex-1 justify-end">
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t({ message: "Close" })}
				className="absolute inset-0 bg-black/40"
				onPress={() => router.back()}
			/>
			<Animated.View style={lift} className="mx-3">
				<ComposerCard>
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
				</ComposerCard>
			</Animated.View>
		</View>
	);
}

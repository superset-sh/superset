import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { X } from "lucide-react-native";
import { forwardRef } from "react";
import { Alert, Pressable, View } from "react-native";
import Animated, {
	useAnimatedKeyboard,
	useAnimatedStyle,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { errorCopy } from "@/lib/errors";
import {
	CommentComposer,
	type CommentComposerHandle,
} from "../../../components/CommentComposer";
import { QuickReplies } from "../../../components/QuickReplies";

interface ReplyBarProps {
	replyingTo: string | null;
	excerpt?: string;
	pending: boolean;
	onCancelReply: () => void;
	onSubmit: (body: string) => Promise<void>;
}

export const ReplyBar = forwardRef<CommentComposerHandle, ReplyBarProps>(
	function ReplyBar(
		{ replyingTo, excerpt, pending, onCancelReply, onSubmit },
		ref,
	) {
		const { t } = useLingui();
		const insets = useSafeAreaInsets();
		const keyboard = useAnimatedKeyboard();

		// The composer owns this for typed replies; a quick reply skips it, and
		// the caller's submit rethrows, so without this the failure is silent.
		const submitQuick = async (body: string) => {
			try {
				await onSubmit(body);
			} catch (error) {
				Alert.alert(t({ message: "Comment not posted" }), errorCopy(error));
			}
		};

		const lift = useAnimatedStyle(() => ({
			paddingBottom: Math.max(keyboard.height.value, insets.bottom),
		}));

		return (
			<Animated.View style={lift} className="bg-background px-3 pt-2">
				{replyingTo ? (
					<View className="mb-2 flex-row items-center justify-between gap-2">
						<View className="shrink flex-row items-baseline gap-1.5">
							<Text className="text-muted-foreground text-xs" numberOfLines={1}>
								{t({ message: `Replying to ${replyingTo}` })}
							</Text>
							{excerpt ? (
								<Text
									className="text-muted-foreground/60 shrink text-xs"
									numberOfLines={1}
								>
									{excerpt}
								</Text>
							) : null}
						</View>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={t({ message: "Cancel reply" })}
							onPress={onCancelReply}
							hitSlop={10}
							className="active:opacity-60"
						>
							<Icon as={X} className="text-muted-foreground size-4" />
						</Pressable>
					</View>
				) : null}

				<View className="bg-foreground/10 rounded-[26px] px-4 pt-3 pb-2.5">
					<CommentComposer
						ref={ref}
						autoFocus
						placeholder={t({ message: "Add a comment…" })}
						pending={pending}
						onSubmit={onSubmit}
						actions={
							<QuickReplies
								disabled={pending}
								onQuick={(body) => void submitQuick(i18n._(body))}
								onPreset={(body) => void submitQuick(body)}
							/>
						}
					/>
				</View>
			</Animated.View>
		);
	},
);

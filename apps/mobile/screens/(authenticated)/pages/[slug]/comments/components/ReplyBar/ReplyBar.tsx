import { useLingui } from "@lingui/react/macro";
import { forwardRef } from "react";
import Animated, {
	useAnimatedKeyboard,
	useAnimatedStyle,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	CommentComposer,
	type CommentComposerHandle,
} from "../../../components/CommentComposer";
import { ComposerCard } from "../../../components/ComposerCard";

interface ReplyBarProps {
	pending: boolean;
	onSubmit: (body: string) => Promise<void>;
}

export const ReplyBar = forwardRef<CommentComposerHandle, ReplyBarProps>(
	function ReplyBar({ pending, onSubmit }, ref) {
		const { t } = useLingui();
		const insets = useSafeAreaInsets();
		const keyboard = useAnimatedKeyboard();

		const lift = useAnimatedStyle(() => ({
			paddingBottom: Math.max(keyboard.height.value, insets.bottom) + 8,
		}));

		return (
			<Animated.View style={lift} className="px-3 pt-2">
				<ComposerCard>
					<CommentComposer
						ref={ref}
						autoFocus
						placeholder={t({ message: "Add a comment…" })}
						pending={pending}
						onSubmit={onSubmit}
					/>
				</ComposerCard>
			</Animated.View>
		);
	},
);

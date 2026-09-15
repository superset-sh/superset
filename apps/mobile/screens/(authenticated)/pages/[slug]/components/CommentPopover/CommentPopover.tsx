import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import type { CommentIntent } from "@superset/shared/page-comments";
import { popoverPlacement } from "@superset/shared/page-comments";
import type { FrameRect } from "@superset/shared/page-comments-runtime";
import { X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
	useAnimatedKeyboard,
	useAnimatedStyle,
} from "react-native-reanimated";
import { Icon } from "@/components/ui/icon";
import { CommentComposer } from "../CommentComposer";
import { ComposerActions } from "../ComposerActions";

const ESTIMATED_HEIGHT = 180;
const KEYBOARD_GAP = 8;

interface CommentPopoverProps {
	rect: FrameRect;
	container: { width: number; height: number };
	pending: boolean;
	onQuick: (body: MessageDescriptor, intent: CommentIntent) => void;
	onOpenPresets: () => void;
	onDismiss: () => void;
	onSubmit: (body: string) => Promise<void>;
}

export function CommentPopover({
	rect,
	container,
	pending,
	onQuick,
	onOpenPresets,
	onDismiss,
	onSubmit,
}: CommentPopoverProps) {
	const { t } = useLingui();
	const keyboard = useAnimatedKeyboard();
	const [height, setHeight] = useState(ESTIMATED_HEIGHT);

	// Anchors to the block's box, not pinPointOf: that point is *inside* the
	// element, so a tall heading would get the card dropped on top of its text.
	const { left, top, width } = popoverPlacement({
		point: { x: rect.left, y: rect.top + rect.height },
		container,
		height,
		pinSize: rect.height,
		maxWidth: container.width,
	});

	// Anchored to the block until the keyboard would swallow it, then lifted by
	// exactly the overlap so it never travels further than it has to.
	const lift = useAnimatedStyle(() => {
		const visibleBottom = container.height - keyboard.height.value;
		const overlap = top + height + KEYBOARD_GAP - visibleBottom;
		return { transform: [{ translateY: overlap > 0 ? -overlap : 0 }] };
	});

	return (
		<Animated.View
			style={[{ position: "absolute", left, top, width }, lift]}
			onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
			className="bg-popover rounded-2xl px-3 py-2 shadow-xl"
		>
			<View className="flex-row items-center justify-between pb-1">
				<ComposerActions
					disabled={pending}
					onQuick={onQuick}
					onOpenPresets={onOpenPresets}
				/>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t({ message: "Close" })}
					onPress={onDismiss}
					hitSlop={10}
					className="active:opacity-60"
				>
					<Icon as={X} className="text-muted-foreground size-4" />
				</Pressable>
			</View>

			<CommentComposer
				autoFocus
				placeholder={t({ message: "Write a comment" })}
				pending={pending}
				onSubmit={onSubmit}
			/>
		</Animated.View>
	);
}

import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import type { CommentIntent } from "@superset/shared/page-comments";
import { popoverPlacement } from "@superset/shared/page-comments";
import type { FrameRect } from "@superset/shared/page-comments-runtime";
import { X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Keyboard, Pressable, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	withTiming,
} from "react-native-reanimated";
import { Icon } from "@/components/ui/icon";
import { CommentComposer } from "../CommentComposer";
import { ComposerActions } from "../ComposerActions";

const ESTIMATED_HEIGHT = 180;
const KEYBOARD_MS = 250;

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
	const [height, setHeight] = useState(ESTIMATED_HEIGHT);
	const [keyboardHeight, setKeyboardHeight] = useState(0);

	useEffect(() => {
		const shown = Keyboard.addListener("keyboardWillShow", (event) =>
			setKeyboardHeight(event.endCoordinates.height),
		);
		const hidden = Keyboard.addListener("keyboardWillHide", () =>
			setKeyboardHeight(0),
		);
		return () => {
			shown.remove();
			hidden.remove();
		};
	}, []);

	// The keyboard takes the bottom of the container away rather than sliding
	// the card over what it is anchored to: placing against what is left lets
	// the card flip above the block, which pinSize sizes to clear.
	const { left, top, width } = popoverPlacement({
		point: { x: rect.left, y: rect.top + rect.height },
		container: {
			width: container.width,
			height: container.height - keyboardHeight,
		},
		height,
		pinSize: rect.height,
		maxWidth: container.width,
	});

	const settle = useAnimatedStyle(() => ({
		top: withTiming(top, { duration: KEYBOARD_MS }),
	}));

	return (
		<Animated.View
			style={[{ position: "absolute", left, width }, settle]}
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

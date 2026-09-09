import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import type { FrameRect } from "@superset/shared/page-comments-runtime";
import * as Haptics from "expo-haptics";
import {
	type LucideIcon,
	MessageSquare,
	ThumbsUp,
	Trash2,
	X,
	Zap,
} from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { APPROVE_BODY, DELETE_BODY } from "./constants";
import { toolbarPlacement } from "./utils/toolbarPlacement";

// Five 44pt targets plus the divider — the iOS minimum, not the desktop 32px.
const SIZE = { width: 252, height: 52 };

interface SelectionToolbarProps {
	rect: FrameRect;
	container: { width: number; height: number };
	onComment: () => void;
	onQuickMenu: () => void;
	onQuick: (body: MessageDescriptor) => void;
	onDismiss: () => void;
}

export function SelectionToolbar({
	rect,
	container,
	onComment,
	onQuickMenu,
	onQuick,
	onDismiss,
}: SelectionToolbarProps) {
	const { t } = useLingui();
	const { left, top } = toolbarPlacement({ rect, container, size: SIZE });

	return (
		<View
			style={{ left, top, width: SIZE.width, height: SIZE.height }}
			className="border-border bg-popover absolute flex-row items-center rounded-2xl border p-1 shadow-lg"
		>
			<ToolbarButton
				icon={Trash2}
				label={t({ message: "Ask for this to be removed" })}
				onPress={() => onQuick(DELETE_BODY)}
			/>
			<ToolbarButton
				icon={MessageSquare}
				label={t({ message: "Write a comment" })}
				onPress={onComment}
			/>
			<ToolbarButton
				icon={Zap}
				label={t({ message: "Quick feedback" })}
				onPress={onQuickMenu}
			/>
			<ToolbarButton
				icon={ThumbsUp}
				label={t({ message: "Looks good" })}
				onPress={() => onQuick(APPROVE_BODY)}
			/>
			<View className="bg-border mx-0.5 h-5 w-px" />
			<ToolbarButton
				icon={X}
				label={t({ message: "Dismiss" })}
				onPress={onDismiss}
			/>
		</View>
	);
}

function ToolbarButton({
	icon,
	label,
	onPress,
}: {
	icon: LucideIcon;
	label: string;
	onPress: () => void;
}) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			onPress={() => {
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				onPress();
			}}
			className="size-11 items-center justify-center rounded-lg active:bg-accent"
		>
			<Icon as={icon} className="text-muted-foreground size-4.5" />
		</Pressable>
	);
}

import { ActivityIndicator, Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import {
	type ActionId,
	actionEmphasis,
} from "../../../../utils/pullRequestState";

/**
 * Colour comes from what the action is, not where it sits in the stack: green
 * merges, white hands work to the agent, grey does everything else. While it
 * runs the label swaps for a spinner and the button keeps its size.
 */
export function ActionButton({
	action,
	label,
	busy,
	onPress,
}: {
	action: ActionId;
	label: string;
	busy?: boolean;
	onPress: () => void;
}) {
	const emphasis = actionEmphasis(action);
	const surface =
		emphasis === "merge"
			? "bg-green-600"
			: emphasis === "agent"
				? "bg-neutral-100"
				: "bg-secondary";
	const ink =
		emphasis === "merge"
			? "text-white"
			: emphasis === "agent"
				? "text-neutral-900"
				: "text-secondary-foreground";

	return (
		<Pressable
			accessibilityLabel={label}
			accessibilityRole="button"
			accessibilityState={{ busy: busy === true, disabled: busy === true }}
			// 34pt to match the design, with the touch target padded back out to
			// the 44pt minimum so the compact look doesn't cost a tap.
			className={cn(
				"h-[34px] items-center justify-center rounded-md px-4 active:opacity-80",
				surface,
			)}
			hitSlop={{ bottom: 5, left: 0, right: 0, top: 5 }}
			disabled={busy}
			onPress={onPress}
		>
			{busy ? (
				<ActivityIndicator color={emphasis === "merge" ? "#fff" : "#111"} />
			) : (
				<Text className={cn("font-medium text-[15px]", ink)} numberOfLines={1}>
					{label}
				</Text>
			)}
		</Pressable>
	);
}

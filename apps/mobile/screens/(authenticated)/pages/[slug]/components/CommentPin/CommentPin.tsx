import * as Haptics from "expo-haptics";
import { Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { PIN_SIZE, type PinPoint, STACK_OFFSET } from "../../utils/pinLayout";

interface CommentPinProps {
	point: PinPoint;
	stackIndex: number;
	initials: string;
	resolved: boolean;
	active: boolean;
	onPress: () => void;
}

export function CommentPin({
	point,
	stackIndex,
	initials,
	resolved,
	active,
	onPress,
}: CommentPinProps) {
	return (
		<Pressable
			accessibilityRole="button"
			style={{
				left: point.x - PIN_SIZE / 2 + stackIndex * STACK_OFFSET,
				top: point.y - PIN_SIZE / 2,
				width: PIN_SIZE,
				height: PIN_SIZE,
				zIndex: stackIndex,
			}}
			onPress={() => {
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
				onPress();
			}}
			className={cn(
				"absolute items-center justify-center rounded-full rounded-bl-sm border border-white/20 shadow-md",
				resolved ? "bg-neutral-500" : "bg-blue-600",
				active && "border-white",
			)}
		>
			<Text className="font-semibold text-[11px] text-white">
				{initials || "?"}
			</Text>
		</Pressable>
	);
}

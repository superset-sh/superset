import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/**
 * Every row in the card is this: something on the left, a line, sometimes a
 * second line under it, sometimes tappable. A ring, a stack of faces or a
 * single avatar goes in `leading` — that is the only difference between them.
 */
export function CardRow({
	leading,
	label,
	subLabel,
	muted,
	onPress,
}: {
	leading?: ReactNode;
	label: string;
	subLabel?: string | null;
	muted?: boolean;
	onPress?: () => void;
}) {
	return (
		<Pressable
			accessibilityLabel={subLabel ? `${label}, ${subLabel}` : label}
			accessibilityRole={onPress ? "button" : undefined}
			// 26pt is an avatar's height, held whether or not this row has one, so
			// a row of bare text keeps the same rhythm as the rows around it.
			className="min-h-[26px] flex-row items-center gap-2.5 active:opacity-60"
			disabled={onPress === undefined}
			onPress={onPress}
		>
			{leading}
			<View className="flex-1">
				<Text
					className={cn("text-[15px]", muted && "text-muted-foreground")}
					numberOfLines={1}
				>
					{label}
				</Text>
				{subLabel ? (
					<Text className="text-muted-foreground text-[13px]">{subLabel}</Text>
				) : null}
			</View>
		</Pressable>
	);
}

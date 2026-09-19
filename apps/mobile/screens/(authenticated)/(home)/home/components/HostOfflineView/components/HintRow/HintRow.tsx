import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";

export function HintRow({
	leading,
	isLast,
	children,
}: {
	leading: ReactNode;
	isLast?: boolean;
	children: ReactNode;
}) {
	return (
		<View
			className={
				isLast
					? "flex-row items-center gap-3 py-3"
					: "border-border flex-row items-center gap-3 border-b py-3"
			}
		>
			<View className="w-5 items-center">{leading}</View>
			<Text className="text-foreground flex-1 text-sm leading-5">
				{children}
			</Text>
		</View>
	);
}

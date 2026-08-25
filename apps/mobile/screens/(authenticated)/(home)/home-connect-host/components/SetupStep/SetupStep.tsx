import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";

export function SetupStep({
	step,
	title,
	children,
}: {
	step: number;
	title: string;
	children?: ReactNode;
}) {
	return (
		<View className="flex-row gap-3">
			<View className="bg-muted size-6 items-center justify-center rounded-full">
				<Text className="text-muted-foreground text-xs font-semibold">
					{step}
				</Text>
			</View>
			<View className="flex-1 gap-0.5">
				<Text className="text-base font-medium text-foreground">{title}</Text>
				{children ? (
					<Text className="text-muted-foreground text-sm leading-5">
						{children}
					</Text>
				) : null}
			</View>
		</View>
	);
}

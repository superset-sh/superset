import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";

export function ListRow({
	icon,
	label,
	subtitle,
	trailing,
	onPress,
	isLast,
	destructive,
}: {
	icon?: ReactNode;
	label: string;
	subtitle?: string;
	trailing?: ReactNode;
	onPress?: () => void;
	isLast?: boolean;
	destructive?: boolean;
}) {
	const theme = useTheme();
	return (
		<Pressable
			onPress={onPress}
			disabled={!onPress}
			className="flex-row items-center gap-3 py-4"
			style={
				isLast
					? undefined
					: {
							borderBottomColor: theme.border,
							borderBottomWidth: StyleSheet.hairlineWidth,
						}
			}
		>
			{icon ? <View className="w-7 items-center">{icon}</View> : null}
			<View className="flex-shrink">
				<Text
					className="text-base"
					style={{
						color: destructive ? theme.destructive : theme.foreground,
					}}
				>
					{label}
				</Text>
				{subtitle ? (
					<Text
						className="text-sm"
						style={{ color: theme.mutedForeground }}
						numberOfLines={1}
					>
						{subtitle}
					</Text>
				) : null}
			</View>
			<View className="flex-1 flex-row items-center justify-end gap-2">
				{trailing}
			</View>
		</Pressable>
	);
}

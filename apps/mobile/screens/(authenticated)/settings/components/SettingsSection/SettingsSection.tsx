import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";

export function SettingsSection({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	const theme = useTheme();
	return (
		<View className="mt-6">
			<Text className="text-sm" style={{ color: theme.mutedForeground }}>
				{label}
			</Text>
			{children}
		</View>
	);
}

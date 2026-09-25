import { Image } from "expo-image";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";

export function ProjectAvatar({
	name,
	iconUrl,
	size,
}: {
	name?: string | null;
	iconUrl?: string | null;
	size: number;
}) {
	const theme = useTheme();
	const radius = size * 0.28;

	if (iconUrl) {
		return (
			<Image
				source={{ uri: iconUrl }}
				style={{ width: size, height: size, borderRadius: radius }}
			/>
		);
	}

	const initial = (name ?? "P").charAt(0).toUpperCase();
	return (
		<View
			className="items-center justify-center"
			style={{
				width: size,
				height: size,
				borderRadius: radius,
				backgroundColor: theme.muted,
			}}
		>
			<Text
				className="font-bold"
				style={{
					fontSize: size * 0.45,
					lineHeight: size,
					width: size,
					textAlign: "center",
					color: theme.mutedForeground,
				}}
			>
				{initial}
			</Text>
		</View>
	);
}

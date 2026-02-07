import { Image, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";

export function OrganizationAvatar({
	name,
	logo,
	size,
}: {
	name?: string | null;
	logo?: string | null;
	size: number;
}) {
	const theme = useTheme();

	if (logo) {
		return (
			<Image
				source={{ uri: logo }}
				style={{ width: size, height: size, borderRadius: size / 2 }}
			/>
		);
	}

	const initial = (name ?? "O").charAt(0).toUpperCase();
	return (
		<View
			className="items-center justify-center"
			style={{
				width: size,
				height: size,
				borderRadius: size / 2,
				backgroundColor: theme.muted,
			}}
		>
			<Text
				className="font-bold"
				style={{ fontSize: size * 0.45, color: theme.mutedForeground }}
			>
				{initial}
			</Text>
		</View>
	);
}
